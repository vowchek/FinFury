import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { IncomeEventType, TransactionType } from '@finfury/contracts';
import { IncomeService } from './income.service';

const ACCOUNT = { id: 'acc1', userId: 'u1', currency: 'RUB' };
const ASSET = { id: 'ast1', symbol: 'GAZP', currency: 'RUB' };

function buildService(overrides: {
  account?: object | null;
  asset?: object | null;
  accounts?: object[];
  events?: object[];
  positions?: object[];
} = {}) {
  const events = {
    create: vi.fn((input: object) => input),
    save: vi.fn(async (row: object) => {
      (row as { id?: string }).id = 'ev1';
      return row;
    }),
    find: vi.fn(async () => overrides.events ?? []),
  };
  const accounts = {
    findOne: vi.fn(async () => (overrides.account === undefined ? ACCOUNT : overrides.account)),
    find: vi.fn(async () => overrides.accounts ?? [ACCOUNT]),
  };
  const assets = {
    findOne: vi.fn(async () => (overrides.asset === undefined ? ASSET : overrides.asset)),
  };
  const transactions = {
    create: vi.fn((input: object) => input),
    save: vi.fn(async (rows: object | object[]) => {
      if (Array.isArray(rows)) {
        rows.forEach((r, i) => {
          (r as { id?: string }).id = `tx${i}`;
        });
        return rows;
      }
      (rows as { id?: string }).id = 'tx0';
      return rows;
    }),
    findOne: vi.fn(async () => null as object | null),
  };
  const positionsRepo = {
    find: vi.fn(async () => overrides.positions ?? []),
  };
  const positions = {
    recalcForAccount: vi.fn(async () => []),
  };
  const lots = {
    recalcForAccount: vi.fn(async () => undefined),
  };
  const service = new IncomeService(
    events as never,
    accounts as never,
    assets as never,
    transactions as never,
    positionsRepo as never,
    positions as never,
    lots as never,
  );
  return { service, events, accounts, assets, transactions, positionsRepo, positions, lots };
}

const BASE = {
  accountId: 'acc1',
  assetId: 'ast1',
  type: IncomeEventType.DIVIDEND,
  paymentDate: '2026-09-01',
  grossAmount: { amount: 1000, currency: 'RUB' },
  reinvested: false,
};

describe('IncomeService.create', () => {
  it('создаёт событие: net = gross − taxWithheld, валюта счёта', async () => {
    const { service } = buildService();

    const result = await service.create('u1', {
      ...BASE,
      taxWithheld: { amount: 130, currency: 'RUB' },
    });

    expect(result.id).toBe('ev1');
    expect(result.type).toBe(IncomeEventType.DIVIDEND);
    expect(result.paymentDate).toBe('2026-09-01');
    expect(result.grossAmount).toEqual({ amount: 1000, currency: 'RUB' });
    expect(result.taxWithheld).toEqual({ amount: 130, currency: 'RUB' });
    expect(result.netAmount).toEqual({ amount: 870, currency: 'RUB' }); // 1000 − 130
    expect(result.reinvested).toBe(false);
  });

  it('денежное зачисление → создаётся связанная income-транзакция на сумму net', async () => {
    const { service, transactions } = buildService();

    const result = await service.create('u1', {
      ...BASE,
      taxWithheld: { amount: 130, currency: 'RUB' },
    });

    const created = transactions.create.mock.calls.map((c) => c[0] as Record<string, unknown>);
    expect(created).toHaveLength(1);
    expect(created[0].type).toBe(TransactionType.INCOME);
    expect(created[0].accountId).toBe('acc1');
    expect(created[0].assetId).toBe('ast1');
    expect(created[0].amountAmount).toBe(870); // фактически зачислено
    expect(created[0].amountCurrency).toBe('RUB');
    expect(result.transactionId).toBe('tx0');
  });

  it('distributed: true → событие без income-транзакции (кэш не меняется)', async () => {
    const { service, transactions } = buildService();

    const result = await service.create('u1', {
      ...BASE,
      distributed: true,
      taxWithheld: { amount: 130, currency: 'RUB' },
    });

    expect(transactions.create).not.toHaveBeenCalled();
    expect(result.transactionId).toBeUndefined();
    expect(result.netAmount).toEqual({ amount: 870, currency: 'RUB' });
  });

  it('distributed + reinvested → 400', async () => {
    const { service } = buildService();
    await expect(
      service.create('u1', {
        ...BASE,
        distributed: true,
        reinvested: true,
        reinvestPrice: { amount: 100, currency: 'RUB' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('distributed + transactionId → 400', async () => {
    const { service } = buildService();
    await expect(
      service.create('u1', { ...BASE, distributed: true, transactionId: 'tx_old' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('DRIP (reinvested: true) → income + buy транзакции и recalcForAccount', async () => {
    const { service, transactions, positions, lots } = buildService();

    const result = await service.create('u1', {
      ...BASE,
      reinvested: true,
      reinvestPrice: { amount: 250, currency: 'RUB' },
    });

    const created = transactions.create.mock.calls.map((c) => c[0] as Record<string, unknown>);
    expect(created).toHaveLength(2);
    expect(created[0].type).toBe(TransactionType.INCOME);
    expect(created[1].type).toBe(TransactionType.BUY);
    // buy: цена реинвестирования из запроса, количество = net / цена
    expect(created[1].priceAmount).toBe(250);
    expect(created[1].priceCurrency).toBe('RUB');
    expect(created[1].quantity).toBe('4'); // 1000 / 250
    expect(created[1].amountAmount).toBe(1000);
    expect(positions.recalcForAccount).toHaveBeenCalledWith('acc1', 'RUB');
    expect(lots.recalcForAccount).toHaveBeenCalledWith('acc1', 'RUB');
    expect(result.reinvested).toBe(true);
  });

  it('DRIP с дробным количеством: quantity хранится как numeric-строка', async () => {
    const { service, transactions } = buildService();

    await service.create('u1', {
      ...BASE,
      reinvested: true,
      reinvestPrice: { amount: 300, currency: 'RUB' },
    });

    const buy = transactions.create.mock.calls[1][0] as Record<string, unknown>;
    expect(buy.quantity).toBe('3.33333333'); // 1000/300, округлено до 8 знаков
  });

  it('DRIP без reinvestPrice → 400', async () => {
    const { service, transactions } = buildService();
    await expect(
      service.create('u1', { ...BASE, reinvested: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transactions.create).not.toHaveBeenCalled();
  });

  it('DRIP с reinvestPrice.amount <= 0 → 400', async () => {
    const { service } = buildService();
    await expect(
      service.create('u1', {
        ...BASE,
        reinvested: true,
        reinvestPrice: { amount: 0, currency: 'RUB' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('transactionId: связывает событие с существующей транзакцией без создания новой', async () => {
    const { service, transactions } = buildService();
    transactions.findOne.mockResolvedValue({ id: 'tx_old', accountId: 'acc1' });

    const result = await service.create('u1', { ...BASE, transactionId: 'tx_old' });

    expect(result.transactionId).toBe('tx_old');
    expect(transactions.create).not.toHaveBeenCalled();
  });

  it('transactionId чужого счёта → 400', async () => {
    const { service, transactions } = buildService();
    transactions.findOne.mockResolvedValue({ id: 'tx_other', accountId: 'acc_other' });
    await expect(
      service.create('u1', { ...BASE, transactionId: 'tx_other' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('чужой счёт → 404', async () => {
    const { service } = buildService({ account: null });
    await expect(service.create('u1', BASE)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('несуществующий актив → 404', async () => {
    const { service } = buildService({ asset: null });
    await expect(service.create('u1', BASE)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('gross < taxWithheld → 400', async () => {
    const { service, transactions } = buildService();
    await expect(
      service.create('u1', {
        ...BASE,
        taxWithheld: { amount: 1100, currency: 'RUB' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transactions.create).not.toHaveBeenCalled();
  });

  it('валюта grossAmount не совпадает с валютой счёта → 400', async () => {
    const { service, transactions } = buildService();
    await expect(
      service.create('u1', {
        ...BASE,
        grossAmount: { amount: 1000, currency: 'USD' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transactions.create).not.toHaveBeenCalled();
  });

  it('валюта taxWithheld не совпадает с валютой счёта → 400', async () => {
    const { service } = buildService();
    await expect(
      service.create('u1', {
        ...BASE,
        taxWithheld: { amount: 100, currency: 'USD' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('IncomeService.list', () => {
  it('возвращает только события счетов пользователя (изоляция по userId)', async () => {
    const { service, events } = buildService({
      events: [
        { id: 'e1', accountId: 'acc1', assetId: 'ast1', paymentDate: '2026-09-01' },
      ],
    });

    const result = await service.list('u1', {});

    expect(events.find).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
  });

  it('чужой accountId в фильтре → 404', async () => {
    const { service } = buildService({ account: null });
    await expect(service.list('u1', { accountId: 'acc_other' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('у пользователя нет счетов → пустой список', async () => {
    const { service, events } = buildService({ accounts: [] });
    const result = await service.list('u1', {});
    expect(result).toEqual([]);
    expect(events.find).not.toHaveBeenCalled();
  });

  it('передаёт фильтры assetId / from / to в where', async () => {
    const { service, events } = buildService();
    await service.list('u1', { assetId: 'ast1', from: '2026-01-01', to: '2026-12-31' });
    const call = events.find.mock.calls[0] as unknown as [{ where: Record<string, unknown> }];
    expect(call[0].where.assetId).toBe('ast1');
    expect(call[0].where.paymentDate).toBeDefined();
  });
});

describe('IncomeService.stats', () => {
  const ROW = (
    id: string,
    assetId: string,
    paymentDate: string,
    gross: number,
    tax: number | null,
  ) => ({
    id,
    accountId: 'acc1',
    assetId,
    paymentDate,
    grossAmount: gross,
    grossCurrency: 'RUB',
    taxWithheldAmount: tax,
    taxWithheldCurrency: tax === null ? null : 'RUB',
    netAmount: gross - (tax ?? 0),
    netCurrency: 'RUB',
  });

  it('агрегирует gross/taxWithheld/net по периодам и активам', async () => {
    const { service } = buildService({
      events: [
        ROW('e1', 'ast1', '2026-09-01', 1000, 130),
        ROW('e2', 'ast1', '2026-09-15', 500, null),
        ROW('e3', 'ast2', '2026-10-01', 2000, 260),
      ],
    });

    const stats = await service.stats('u1', {});

    expect(stats.totals).toEqual([
      {
        key: 'RUB',
        count: 3,
        gross: { amount: 3500, currency: 'RUB' },
        taxWithheld: { amount: 390, currency: 'RUB' },
        net: { amount: 3110, currency: 'RUB' },
        yieldPct: null, // позиций нет — доходность не считается
      },
    ]);
    expect(stats.byPeriod).toEqual([
      {
        key: '2026-09',
        count: 2,
        gross: { amount: 1500, currency: 'RUB' },
        taxWithheld: { amount: 130, currency: 'RUB' },
        net: { amount: 1370, currency: 'RUB' },
      },
      {
        key: '2026-10',
        count: 1,
        gross: { amount: 2000, currency: 'RUB' },
        taxWithheld: { amount: 260, currency: 'RUB' },
        net: { amount: 1740, currency: 'RUB' },
      },
    ]);
    expect(stats.byAsset).toEqual([
      {
        key: 'ast1',
        count: 2,
        gross: { amount: 1500, currency: 'RUB' },
        taxWithheld: { amount: 130, currency: 'RUB' },
        net: { amount: 1370, currency: 'RUB' },
        yieldPct: null,
      },
      {
        key: 'ast2',
        count: 1,
        gross: { amount: 2000, currency: 'RUB' },
        taxWithheld: { amount: 260, currency: 'RUB' },
        net: { amount: 1740, currency: 'RUB' },
        yieldPct: null,
      },
    ]);
  });

  it('не смешивает валюты внутри группы', async () => {
    const { service } = buildService({
      events: [
        { ...ROW('e1', 'ast1', '2026-09-01', 1000, 130), grossCurrency: 'USD', netCurrency: 'USD', taxWithheldCurrency: 'USD' },
        ROW('e2', 'ast1', '2026-09-15', 500, null),
      ],
    });

    const stats = await service.stats('u1', {});

    expect(stats.byAsset).toHaveLength(2);
    expect(stats.byAsset[0].gross).toEqual({ amount: 1000, currency: 'USD' });
    expect(stats.byAsset[1].gross).toEqual({ amount: 500, currency: 'RUB' });
  });

  it('нет событий → пустая статистика', async () => {
    const { service } = buildService();
    const stats = await service.stats('u1', {});
    expect(stats).toEqual({ totals: [], byPeriod: [], byAsset: [] });
  });

  it('yieldPct = net / costBasis × 100 на текущей себестоимости позиции (byAsset и totals)', async () => {
    const { service } = buildService({
      events: [ROW('e1', 'ast1', '2026-09-01', 1000, 130)],
      positions: [
        { assetId: 'ast1', accountId: 'acc1', quantity: '10', avgCostBasisAmount: 10000, currency: 'RUB' },
      ],
    });

    const stats = await service.stats('u1', {});

    // costBasis = 10 × 10000 = 100000; net = 870; yield = 870/100000×100 = 0.87
    expect(stats.byAsset[0].yieldPct).toBe(0.87);
    expect(stats.totals[0].yieldPct).toBe(0.87);
    // per-period yield не считается
    expect(stats.byPeriod[0].yieldPct).toBeUndefined();
  });

  it('yieldPct = null, если позиции нет (полностью продана)', async () => {
    const { service } = buildService({
      events: [ROW('e1', 'ast1', '2026-09-01', 1000, 130)],
    });

    const stats = await service.stats('u1', {});

    expect(stats.byAsset[0].yieldPct).toBeNull();
    expect(stats.totals[0].yieldPct).toBeNull();
  });
});