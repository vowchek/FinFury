import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ImportSourceType, TransactionType } from '@finfury/contracts';
import { TransactionsService } from './transactions.service';

const ACCOUNT = { id: 'acc1', userId: 'u1', currency: 'RUB' };
const ASSET = { id: 'ast1', symbol: 'GAZP', currency: 'RUB' };

function buildService(overrides: {
  account?: object | null;
  asset?: object | null;
  transactionsCount?: number;
  availableQuantity?: number;
} = {}) {
  const transactions = {
    create: vi.fn((input: object) => input),
    save: vi.fn(async (rows: object[]) => rows),
    count: vi.fn(async () => overrides.transactionsCount ?? 0),
    findOne: vi.fn(async () => null as object | null),
    remove: vi.fn(async () => undefined),
  };
  const accounts = {
    findOne: vi.fn(async () => (overrides.account === undefined ? ACCOUNT : overrides.account)),
  };
  const assets = {
    findOne: vi.fn(async () => (overrides.asset === undefined ? ASSET : overrides.asset)),
  };
  const positions = {
    recalcForAccount: vi.fn(async () => []),
  };
  const lots = {
    recalcForAccount: vi.fn(async () => undefined),
    availableQuantity: vi.fn(async () => overrides.availableQuantity ?? 0),
  };
  const prices = {
    getFxRate: vi.fn(async (from: string, to: string) => {
      const f = from.toUpperCase();
      const t = to.toUpperCase();
      if (f === t) return { rate: 1, from: f, to: t, asOf: '2026-03-14', source: 'stub' };
      if (f === 'USD' && t === 'RUB') {
        return { rate: 100, from: f, to: t, asOf: '2026-03-14', source: 'stub' };
      }
      if (f === 'RUB' && t === 'USD') {
        return { rate: 0.01, from: f, to: t, asOf: '2026-03-14', source: 'stub' };
      }
      throw new Error(`no fx ${f}/${t}`);
    }),
  };
  const service = new TransactionsService(
    transactions as never,
    accounts as never,
    assets as never,
    positions as never,
    lots as never,
    prices as never,
  );
  return { service, transactions, accounts, assets, positions, lots, prices };
}

describe('TransactionsService.create (обычная сделка)', () => {
  it('создаёт BUY и пересчитывает позиции/партии', async () => {
    const { service, transactions, positions, lots } = buildService();

    const result = await service.create('u1', 'acc1', {
      type: TransactionType.BUY,
      date: '2026-09-01',
      assetId: 'ast1',
      quantity: 5,
      price: { amount: 10000, currency: 'RUB' },
      amount: { amount: 50000, currency: 'RUB' },
    });

    expect(transactions.save).toHaveBeenCalledTimes(1);
    expect(positions.recalcForAccount).toHaveBeenCalledWith('acc1', 'RUB');
    expect(lots.recalcForAccount).toHaveBeenCalledWith('acc1', 'RUB');
    expect(result.type).toBe(TransactionType.BUY);
    expect(result.quantity).toBe(5);
    expect(result.amount).toEqual({ amount: 50000, currency: 'RUB' });
  });

  it('BUY иностранной акции: цена USD → книга в RUB', async () => {
    const { service, prices } = buildService({
      asset: { id: 'ast1', symbol: 'AAPL', currency: 'USD', type: 'stock' },
    });

    const result = await service.create('u1', 'acc1', {
      type: TransactionType.BUY,
      date: '2026-09-01',
      assetId: 'ast1',
      quantity: 1,
      price: { amount: 30_000, currency: 'USD' }, // $300.00
      amount: { amount: 30_000, currency: 'USD' },
    });

    expect(prices.getFxRate).toHaveBeenCalledWith('USD', 'RUB');
    expect(result.price).toEqual({ amount: 3_000_000, currency: 'RUB' });
    expect(result.amount).toEqual({ amount: 3_000_000, currency: 'RUB' });
  });

  it('комиссия в валюте счёта не конвертируется повторно', async () => {
    const { service, prices } = buildService({
      asset: { id: 'ast1', symbol: 'AAPL', currency: 'USD', type: 'stock' },
    });

    const result = await service.create('u1', 'acc1', {
      type: TransactionType.BUY,
      date: '2026-09-01',
      assetId: 'ast1',
      quantity: 1,
      price: { amount: 30_000, currency: 'USD' },
      amount: { amount: 30_000, currency: 'USD' },
      fee: { amount: 100, currency: 'RUB' },
    });

    expect(result.fee).toEqual({ amount: 100, currency: 'RUB' });
    // FX только для USD→RUB полей, не для fee уже в RUB
    expect(prices.getFxRate).toHaveBeenCalledWith('USD', 'RUB');
    expect(prices.getFxRate).not.toHaveBeenCalledWith('RUB', 'RUB');
  });

  it('чужой счёт → 404', async () => {
    const { service } = buildService({ account: null });
    await expect(
      service.create('u1', 'acc-x', {
        type: TransactionType.BUY,
        date: '2026-09-01',
        assetId: 'ast1',
        quantity: 1,
        price: { amount: 100, currency: 'RUB' },
        amount: { amount: 100, currency: 'RUB' },
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('TransactionsService.createOpening (snapshot-ввод)', () => {
  it('конвертирует позиции в opening-транзакции: amount = qty × price, флаг opening, source manual', async () => {
    const { service, transactions, positions } = buildService();

    const result = await service.createOpening('u1', 'acc1', {
      date: '2026-09-01',
      items: [
        { assetId: 'ast1', quantity: 10, avgPrice: { amount: 10000, currency: 'RUB' } },
        { assetId: 'ast2', quantity: 2, avgPrice: { amount: 5000, currency: 'RUB' } },
      ],
    });

    expect(transactions.create).toHaveBeenCalledTimes(2);
    expect(transactions.save).toHaveBeenCalledTimes(1);

    // флаг opening проставляется на сущности (в DTO не выводится)
    const created = transactions.create.mock.calls.map((c) => c[0] as Record<string, unknown>);
    expect(created[0].opening).toBe(true);
    expect(created[0].type).toBe(TransactionType.OPENING);
    expect(created[0].source).toBe(ImportSourceType.MANUAL);

    expect(result).toHaveLength(2);
    const first = result[0];
    expect(first.type).toBe(TransactionType.OPENING);
    expect(first.source).toBe(ImportSourceType.MANUAL);
    expect(first.date).toBe('2026-09-01');
    expect(first.quantity).toBe(10);
    expect(first.price).toEqual({ amount: 10000, currency: 'RUB' });
    expect(first.amount).toEqual({ amount: 100000, currency: 'RUB' }); // 10 × 10000

    expect(result[1].amount).toEqual({ amount: 10000, currency: 'RUB' }); // 2 × 5000
    expect(positions.recalcForAccount).toHaveBeenCalledWith('acc1', 'RUB');
  });

  it('пересчитывает позиции с валютой счёта', async () => {
    const { service, positions } = buildService();
    await service.createOpening('u1', 'acc1', {
      date: '2026-09-01',
      items: [{ assetId: 'ast1', quantity: 5, avgPrice: { amount: 2000, currency: 'RUB' } }],
    });
    expect(positions.recalcForAccount).toHaveBeenCalledWith('acc1', 'RUB');
  });

  it('несуществующий актив → 404', async () => {
    const { service } = buildService({ asset: null });
    await expect(
      service.createOpening('u1', 'acc1', {
        date: '2026-09-01',
        items: [{ assetId: 'nope', quantity: 1, avgPrice: { amount: 100, currency: 'RUB' } }],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('quantity ≤ 0 → 400', async () => {
    const { service } = buildService();
    await expect(
      service.createOpening('u1', 'acc1', {
        date: '2026-09-01',
        items: [{ assetId: 'ast1', quantity: 0, avgPrice: { amount: 100, currency: 'RUB' } }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('цена в USD на RUB-счёте → FX в RUB (100 USD → 10_000 RUB при rate 100)', async () => {
    const { service, transactions, prices } = buildService({
      asset: { id: 'ast1', symbol: 'AAPL', currency: 'USD', type: 'stock' },
    });

    const result = await service.createOpening('u1', 'acc1', {
      date: '2026-09-01',
      items: [{ assetId: 'ast1', quantity: 1, avgPrice: { amount: 30_000, currency: 'USD' } }],
    });

    expect(prices.getFxRate).toHaveBeenCalledWith('USD', 'RUB');
    expect(result[0].price).toEqual({ amount: 3_000_000, currency: 'RUB' }); // 300.00 USD × 100
    expect(result[0].amount).toEqual({ amount: 3_000_000, currency: 'RUB' });
    const created = transactions.create.mock.calls[0][0] as Record<string, unknown>;
    expect(created.priceCurrency).toBe('RUB');
  });

  it('счёт уже имеет транзакции → 409 Conflict (guard на повторный snapshot)', async () => {
    const { service, transactions } = buildService({ transactionsCount: 1 });

    await expect(
      service.createOpening('u1', 'acc1', {
        date: '2026-09-01',
        items: [{ assetId: 'ast1', quantity: 1, avgPrice: { amount: 100, currency: 'RUB' } }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    // Ничего не создаётся и не сохраняется.
    expect(transactions.create).not.toHaveBeenCalled();
    expect(transactions.save).not.toHaveBeenCalled();
  });

  it('пустой счёт → snapshot проходит (guard не срабатывает)', async () => {
    const { service, transactions } = buildService({ transactionsCount: 0 });

    const result = await service.createOpening('u1', 'acc1', {
      date: '2026-09-01',
      items: [{ assetId: 'ast1', quantity: 1, avgPrice: { amount: 100, currency: 'RUB' } }],
    });

    expect(result).toHaveLength(1);
    expect(transactions.save).toHaveBeenCalledTimes(1);
  });

  it('чужой счёт → 404 (проверка владения)', async () => {
    const { service } = buildService({ account: null });
    await expect(
      service.createOpening('u1', 'acc1', {
        date: '2026-09-01',
        items: [{ assetId: 'ast1', quantity: 1, avgPrice: { amount: 100, currency: 'RUB' } }],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('после createOpening пересчитываются позиции и партии', async () => {
    const { service, positions, lots } = buildService();
    await service.createOpening('u1', 'acc1', {
      date: '2026-09-01',
      items: [{ assetId: 'ast1', quantity: 1, avgPrice: { amount: 100, currency: 'RUB' } }],
    });
    expect(positions.recalcForAccount).toHaveBeenCalledWith('acc1', 'RUB');
    expect(lots.recalcForAccount).toHaveBeenCalledWith('acc1', 'RUB');
  });
});

describe('TransactionsService: валидация продажи и пересчёт партий', () => {
  const SELL_DTO = {
    type: TransactionType.SELL,
    date: '2026-09-10',
    assetId: 'ast1',
    quantity: 5,
    amount: { amount: 60000, currency: 'RUB' },
  };

  it('create sell сверх доступных партий → 400, транзакция не сохраняется', async () => {
    const { service, transactions } = buildService({ availableQuantity: 4 });

    await expect(service.create('u1', 'acc1', SELL_DTO)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(transactions.save).not.toHaveBeenCalled();
  });

  it('create sell в пределах партий → сохраняется, пересчитываются позиции и партии', async () => {
    const { service, transactions, positions, lots } = buildService({ availableQuantity: 10 });

    await service.create('u1', 'acc1', SELL_DTO);

    expect(transactions.save).toHaveBeenCalledTimes(1);
    expect(positions.recalcForAccount).toHaveBeenCalledWith('acc1', 'RUB');
    expect(lots.recalcForAccount).toHaveBeenCalledWith('acc1', 'RUB');
  });

  it('update sell сверх партий (с учётом списания самой транзакции) → 400', async () => {
    const { service, transactions } = buildService({ availableQuantity: 2 });
    // текущая транзакция — sell 3 шт. того же актива (уже списана из партий)
    transactions.findOne.mockResolvedValue({
      id: 'tx1',
      accountId: 'acc1',
      assetId: 'ast1',
      type: TransactionType.SELL,
      quantity: '3',
      date: '2026-09-10',
    });

    await expect(
      service.update('u1', 'tx1', { quantity: 6 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('update sell в пределах партий (с учётом списания самой транзакции) → проходит', async () => {
    const { service, transactions, lots } = buildService({ availableQuantity: 2 });
    transactions.findOne.mockResolvedValue({
      id: 'tx1',
      accountId: 'acc1',
      assetId: 'ast1',
      type: TransactionType.SELL,
      quantity: '3',
      date: '2026-09-10',
    });

    // доступно 2 + списание текущей 3 = 5; новая продажа 4 ≤ 5
    await service.update('u1', 'tx1', { quantity: 4 });

    expect(lots.recalcForAccount).toHaveBeenCalledWith('acc1', 'RUB');
  });

  it('после update/remove вызывается lots.recalcForAccount', async () => {
    const { service, transactions, lots } = buildService();
    transactions.findOne.mockResolvedValue({
      id: 'tx1',
      accountId: 'acc1',
      assetId: 'ast1',
      type: TransactionType.BUY,
      quantity: '3',
      date: '2026-09-10',
    });

    await service.update('u1', 'tx1', { note: 'x' });
    expect(lots.recalcForAccount).toHaveBeenCalledWith('acc1', 'RUB');

    lots.recalcForAccount.mockClear();
    await service.remove('u1', 'tx1');
    expect(lots.recalcForAccount).toHaveBeenCalledWith('acc1', 'RUB');
  });
});