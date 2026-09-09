import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { TransactionType } from '@finfury/contracts';
import { LotsService } from './lots.service';

const ACCOUNT = { id: 'acc1', userId: 'u1', currency: 'RUB' };

function buildService(overrides: {
  transactions?: object[];
  positions?: object[];
  lots?: object[];
  account?: object | null;
} = {}) {
  const transactions = {
    find: vi.fn(async () => overrides.transactions ?? []),
    update: vi.fn(async () => undefined),
  };
  const positions = {
    find: vi.fn(async () => overrides.positions ?? []),
  };
  const lots = {
    find: vi.fn(async () => overrides.lots ?? []),
    delete: vi.fn(async (_where: object) => undefined),
    save: vi.fn(async (rows: object[]) => rows),
  };
  const accounts = {
    findOne: vi.fn(async () => (overrides.account === undefined ? ACCOUNT : overrides.account)),
  };
  const service = new LotsService(
    lots as never,
    positions as never,
    transactions as never,
    accounts as never,
  );
  return { service, transactions, positions, lots, accounts };
}

const BUY = TransactionType.BUY;
const SELL = TransactionType.SELL;

function tx(id: string, assetId: string, type: TransactionType, quantity: number, price: number | null, amount: number, date = '2026-09-01') {
  return {
    id,
    accountId: 'acc1',
    assetId,
    type,
    date,
    quantity: String(quantity),
    priceAmount: price,
    amountAmount: amount,
    feeAmount: null,
    taxAmount: null,
  };
}

describe('LotsService.recalcForAccount', () => {
  it('синхронизирует кэш lots: delete по positionId и save актуальных партий', async () => {
    const { service, lots, positions } = buildService({
      transactions: [tx('t1', 'a1', BUY, 10, 10000, 100000)],
      positions: [{ id: 'pos1', accountId: 'acc1', assetId: 'a1' }],
    });

    await service.recalcForAccount('acc1', 'RUB');

    expect(lots.delete).toHaveBeenCalledTimes(1);
    const deleteWhere = (lots.delete.mock.calls[0][0] as { positionId: { _value: string[] } }).positionId;
    expect(deleteWhere._value).toEqual(['pos1']);
    expect(lots.save).toHaveBeenCalledTimes(1);
    const saved = lots.save.mock.calls[0][0] as Record<string, unknown>[];
    expect(saved).toEqual([
      {
        positionId: 'pos1',
        quantity: '10',
        costBasisAmount: 10000,
        costBasisCurrency: 'RUB',
        acquiredAt: '2026-09-01',
      },
    ]);
    expect(positions.find).toHaveBeenCalledWith({ where: { accountId: 'acc1' } });
  });

  it('записывает realizedPnl в sell-транзакции', async () => {
    const { service, transactions } = buildService({
      transactions: [
        tx('t1', 'a1', BUY, 10, 10000, 100000),
        tx('t2', 'a1', SELL, 4, 12000, 48000, '2026-09-10'),
      ],
      positions: [{ id: 'pos1', accountId: 'acc1', assetId: 'a1' }],
    });

    await service.recalcForAccount('acc1', 'RUB');

    // очистка всех транзакций счёта
    expect(transactions.update).toHaveBeenCalledWith(
      { accountId: 'acc1' },
      { realizedPnlAmount: null, realizedPnlCurrency: null },
    );
    // realizedPnl = 48000 − 4×10000 = 8000
    expect(transactions.update).toHaveBeenCalledWith(
      { id: 't2' },
      { realizedPnlAmount: 8000, realizedPnlCurrency: 'RUB' },
    );
  });

  it('остатки после полной продажи очищаются (save не вызывается)', async () => {
    const { service, lots } = buildService({
      transactions: [
        tx('t1', 'a1', BUY, 10, 10000, 100000),
        tx('t2', 'a1', SELL, 10, 12000, 120000, '2026-09-10'),
      ],
      positions: [{ id: 'pos1', accountId: 'acc1', assetId: 'a1' }],
    });

    await service.recalcForAccount('acc1', 'RUB');

    expect(lots.delete).toHaveBeenCalledTimes(1);
    const deleteWhere = (lots.delete.mock.calls[0][0] as { positionId: { _value: string[] } }).positionId;
    expect(deleteWhere._value).toEqual(['pos1']);
    expect(lots.save).not.toHaveBeenCalled();
  });

  it('продажа сверх остатка в калькуляторе → 400 BadRequest', async () => {
    const { service } = buildService({
      transactions: [
        tx('t1', 'a1', BUY, 5, 10000, 50000),
        tx('t2', 'a1', SELL, 6, 12000, 72000, '2026-09-10'),
      ],
      positions: [{ id: 'pos1', accountId: 'acc1', assetId: 'a1' }],
    });

    await expect(service.recalcForAccount('acc1', 'RUB')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('LotsService.list', () => {
  it('возвращает партии счёта с assetId/accountId из позиции', async () => {
    const { service } = buildService({
      positions: [{ id: 'pos1', accountId: 'acc1', assetId: 'a1' }],
      lots: [
        {
          id: 'lot1',
          positionId: 'pos1',
          quantity: '6',
          costBasisAmount: 10000,
          costBasisCurrency: 'RUB',
          acquiredAt: '2026-09-01',
          createdAt: new Date('2026-09-01T10:00:00Z'),
        },
      ],
    });

    const result = await service.list('u1', 'acc1');

    expect(result).toEqual([
      {
        id: 'lot1',
        positionId: 'pos1',
        assetId: 'a1',
        accountId: 'acc1',
        quantity: 6,
        costBasis: { amount: 10000, currency: 'RUB' },
        acquiredAt: '2026-09-01',
        createdAt: '2026-09-01T10:00:00.000Z',
      },
    ]);
  });

  it('фильтр assetId передаётся в запрос позиций', async () => {
    const { service, positions } = buildService({
      positions: [{ id: 'pos1', accountId: 'acc1', assetId: 'a1' }],
    });

    await service.list('u1', 'acc1', 'a1');

    expect(positions.find).toHaveBeenCalledWith({ where: { accountId: 'acc1', assetId: 'a1' } });
  });

  it('чужой счёт → 404', async () => {
    const { service } = buildService({ account: null });
    await expect(service.list('u1', 'acc_other')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('нет позиций → пустой список', async () => {
    const { service } = buildService();
    expect(await service.list('u1', 'acc1')).toEqual([]);
  });
});

describe('LotsService.availableQuantity', () => {
  it('суммирует остатки партий актива', async () => {
    const { service } = buildService({
      positions: [{ id: 'pos1', accountId: 'acc1', assetId: 'a1' }],
      lots: [
        { id: 'lot1', positionId: 'pos1', quantity: '6' },
        { id: 'lot2', positionId: 'pos1', quantity: '2.5' },
      ],
    });

    expect(await service.availableQuantity('acc1', 'a1')).toBe(8.5);
  });

  it('нет позиции → 0', async () => {
    const { service } = buildService();
    expect(await service.availableQuantity('acc1', 'a1')).toBe(0);
  });
});