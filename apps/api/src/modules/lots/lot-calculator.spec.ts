import { describe, expect, it } from 'vitest';
import { TransactionType } from '@finfury/contracts';
import {
  calculateLots,
  InsufficientLotsError,
  LotTransactionInput,
} from './lot-calculator';

function tx(
  id: string,
  assetId: string,
  type: TransactionType,
  quantity: number,
  priceMinors: number | null,
  amountMinors: number | null,
  date = '2026-09-01',
): LotTransactionInput {
  return { id, assetId, type, date, quantity, priceMinors, amountMinors, feeMinors: null, taxMinors: null };
}

const BUY = TransactionType.BUY;
const SELL = TransactionType.SELL;
const OPENING = TransactionType.OPENING;

describe('calculateLots (FIFO)', () => {
  it('buy создаёт партию с cost basis = цена и acquiredAt = дата', () => {
    const { lots, realizedPnl } = calculateLots([
      tx('t1', 'a1', BUY, 10, 10000, 100000, '2026-09-01'),
    ]);

    expect(lots).toEqual([
      { assetId: 'a1', quantity: 10, costBasisMinors: 10000, acquiredAt: '2026-09-01' },
    ]);
    expect(realizedPnl).toEqual([]);
  });

  it('opening создаёт партию по введённому cost basis (как buy)', () => {
    const { lots } = calculateLots([
      tx('t1', 'a1', OPENING, 5, 5000, 25000, '2026-08-01'),
    ]);

    expect(lots).toEqual([
      { assetId: 'a1', quantity: 5, costBasisMinors: 5000, acquiredAt: '2026-08-01' },
    ]);
  });

  it('sell списывает старейшие партии первыми (FIFO) и считает realizedPnl = выручка − себестоимость', () => {
    const { lots, realizedPnl } = calculateLots([
      tx('t1', 'a1', BUY, 2, 10000, 20000, '2026-09-01'), // 2 @ 100.00
      tx('t2', 'a1', BUY, 2, 14000, 28000, '2026-09-10'), // 2 @ 140.00
      tx('t3', 'a1', SELL, 2, 16000, 32000, '2026-09-20'), // продажа 2: списывается партия @100
    ]);

    // остаток: 2 @ 140.00
    expect(lots).toEqual([
      { assetId: 'a1', quantity: 2, costBasisMinors: 14000, acquiredAt: '2026-09-10' },
    ]);
    // realizedPnl = 32000 − 2×10000 = 12000
    expect(realizedPnl).toEqual([{ transactionId: 't3', realizedPnlMinors: 12000 }]);
  });

  it('частичное списание дробит партию', () => {
    const { lots } = calculateLots([
      tx('t1', 'a1', BUY, 10, 10000, 100000, '2026-09-01'),
      tx('t2', 'a1', SELL, 4, 12000, 48000, '2026-09-05'),
    ]);

    expect(lots).toEqual([
      { assetId: 'a1', quantity: 6, costBasisMinors: 10000, acquiredAt: '2026-09-01' },
    ]);
  });

  it('списание через несколько партий: себестоимость = Σ(количество × costBasis)', () => {
    const { lots, realizedPnl } = calculateLots([
      tx('t1', 'a1', BUY, 2, 10000, 20000, '2026-09-01'),
      tx('t2', 'a1', BUY, 2, 14000, 28000, '2026-09-10'),
      tx('t3', 'a1', SELL, 3, 13000, 39000, '2026-09-20'), // 2@100 + 1@140
    ]);

    expect(lots).toEqual([
      { assetId: 'a1', quantity: 1, costBasisMinors: 14000, acquiredAt: '2026-09-10' },
    ]);
    // realizedPnl = 39000 − (2×10000 + 1×14000) = 39000 − 34000 = 5000
    expect(realizedPnl).toEqual([{ transactionId: 't3', realizedPnlMinors: 5000 }]);
  });

  it('realizedPnl учитывает комиссию и налог: выручка = amount − fee − tax', () => {
    const { realizedPnl } = calculateLots([
      tx('t1', 'a1', BUY, 10, 10000, 100000, '2026-09-01'),
      {
        ...tx('t2', 'a1', SELL, 10, 12000, 120000, '2026-09-05'),
        feeMinors: 500,
        taxMinors: 1000,
      },
    ]);

    // выручка = 120000 − 500 − 1000 = 118500; себестоимость = 10×10000 = 100000
    expect(realizedPnl).toEqual([{ transactionId: 't2', realizedPnlMinors: 18500 }]);
  });

  it('продажа сверх остатка партий → InsufficientLotsError', () => {
    expect(() =>
      calculateLots([
        tx('t1', 'a1', BUY, 5, 10000, 50000, '2026-09-01'),
        tx('t2', 'a1', SELL, 6, 12000, 72000, '2026-09-05'),
      ]),
    ).toThrow(InsufficientLotsError);
  });

  it('денежные типы (dividend/fee/tax) не создают партий', () => {
    const { lots, realizedPnl } = calculateLots([
      tx('t1', 'a1', BUY, 1, 10000, 10000, '2026-09-01'),
      tx('t2', 'a1', TransactionType.DIVIDEND, 0, null, 500, '2026-09-10'),
      tx('t3', 'a2', TransactionType.FEE, 0, null, 100, '2026-09-10'),
    ]);

    expect(lots).toHaveLength(1);
    expect(lots[0].assetId).toBe('a1');
    expect(realizedPnl).toEqual([]);
  });

  it('разделяет партии по разным активам', () => {
    const { lots } = calculateLots([
      tx('t1', 'a1', BUY, 1, 10000, 10000, '2026-09-01'),
      tx('t2', 'a2', BUY, 5, 2000, 10000, '2026-09-01'),
    ]);

    expect(lots).toHaveLength(2);
  });
});