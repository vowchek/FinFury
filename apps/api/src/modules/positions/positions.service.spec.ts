import { describe, expect, it, vi } from 'vitest';
import { TransactionType } from '@finfury/contracts';
import { PositionsService } from './positions.service';

function buildService(transactions: object[] = []) {
  const transactionsRepo = {
    find: vi.fn(async () => transactions),
  };
  const positionsRepo = {
    delete: vi.fn(async () => undefined),
    upsert: vi.fn(async () => undefined),
    findBy: vi.fn(async ({ accountId }: { accountId: string }) => [
      {
        accountId,
        assetId: 'a1',
        quantity: '6',
        avgCostBasisAmount: 10000,
        avgCostBasisCurrency: 'RUB',
        currency: 'RUB',
      },
    ]),
  };
  const service = new PositionsService(transactionsRepo as never, positionsRepo as never);
  return { service, transactionsRepo, positionsRepo };
}

function tx(
  assetId: string | null,
  type: TransactionType,
  quantity: number | null,
  price: number | null,
) {
  return {
    accountId: 'acc1',
    assetId,
    type,
    quantity: quantity === null ? null : String(quantity),
    priceAmount: price,
  };
}

describe('PositionsService.recalcForAccount', () => {
  it('считает AVCO и upsert позиций с валютой счёта', async () => {
    const { service, positionsRepo } = buildService([
      tx('a1', TransactionType.BUY, 10, 10000),
      tx('a1', TransactionType.SELL, 4, 12000),
    ]);

    const result = await service.recalcForAccount('acc1', 'RUB');

    expect(positionsRepo.delete).toHaveBeenCalledTimes(1);
    expect(positionsRepo.upsert).toHaveBeenCalledTimes(1);
    const [rows, opts] = positionsRepo.upsert.mock.calls[0] as unknown as [
      Record<string, unknown>[],
      { conflictPaths: string[] },
    ];
    expect(opts.conflictPaths).toEqual(['accountId', 'assetId']);
    expect(rows).toEqual([
      {
        accountId: 'acc1',
        assetId: 'a1',
        quantity: '6',
        avgCostBasisAmount: 10000,
        avgCostBasisCurrency: 'RUB',
        currency: 'RUB',
      },
    ]);
    expect(result).toHaveLength(1);
    expect(positionsRepo.findBy).toHaveBeenCalledWith({ accountId: 'acc1' });
  });

  it('без buy/opening удаляет все позиции счёта', async () => {
    const { service, positionsRepo } = buildService([
      tx(null, TransactionType.FEE, null, null),
      tx(null, TransactionType.DEPOSIT, null, null),
    ]);

    const result = await service.recalcForAccount('acc1', 'RUB');

    expect(result).toEqual([]);
    expect(positionsRepo.delete).toHaveBeenCalledWith({ accountId: 'acc1' });
    expect(positionsRepo.upsert).not.toHaveBeenCalled();
  });

  it('после полной продажи upsert с quantity 0 (AVCO оставляет группу)', async () => {
    const { service, positionsRepo } = buildService([
      tx('a1', TransactionType.BUY, 5, 10000),
      tx('a1', TransactionType.SELL, 5, 11000),
    ]);

    await service.recalcForAccount('acc1', 'RUB');

    const [rows] = positionsRepo.upsert.mock.calls[0] as unknown as [Record<string, unknown>[]];
    expect(rows[0]).toMatchObject({ assetId: 'a1', quantity: '0', avgCostBasisAmount: 10000 });
  });

  it('игнорирует транзакции без assetId (fee/tax/deposit)', async () => {
    const { service, positionsRepo } = buildService([
      tx(null, TransactionType.FEE, null, null),
      tx('a1', TransactionType.BUY, 2, 5000),
    ]);

    await service.recalcForAccount('acc1', 'USD');

    const [rows] = positionsRepo.upsert.mock.calls[0] as unknown as [Record<string, unknown>[]];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      assetId: 'a1',
      quantity: '2',
      avgCostBasisAmount: 5000,
      currency: 'USD',
      avgCostBasisCurrency: 'USD',
    });
  });

  it('учитывает opening как покупку', async () => {
    const { service, positionsRepo } = buildService([
      tx('a1', TransactionType.OPENING, 3, 8000),
    ]);

    await service.recalcForAccount('acc1', 'RUB');

    const [rows] = positionsRepo.upsert.mock.calls[0] as unknown as [Record<string, unknown>[]];
    expect(rows[0]).toMatchObject({
      assetId: 'a1',
      quantity: '3',
      avgCostBasisAmount: 8000,
    });
  });
});
