import { describe, expect, it } from 'vitest';
import { TransactionType } from '@finfury/contracts';
import { calculateAverageCostBasis, CostTransactionInput } from './position-calculator';

function tx(assetId: string, type: TransactionType, quantity: number, priceMinors: number | null): CostTransactionInput {
  return { assetId, type, quantity, priceMinors };
}

const BUY = TransactionType.BUY;
const SELL = TransactionType.SELL;
const OPENING = TransactionType.OPENING;

describe('calculateAverageCostBasis (AVCO)', () => {
  it('усредняет cost basis по двум покупкам', () => {
    const positions = calculateAverageCostBasis([
      tx('a1', BUY, 2, 10000), // 2 @ 100.00
      tx('a1', BUY, 2, 14000), // 2 @ 140.00
    ]);

    expect(positions).toEqual([
      { assetId: 'a1', quantity: 4, avgCostBasisMinors: 12000 }, // (20000+28000)/4 = 12000
    ]);
  });

  it('sell не меняет среднюю стоимость (AVCO)', () => {
    const positions = calculateAverageCostBasis([
      tx('a1', BUY, 2, 10000),
      tx('a1', BUY, 2, 14000),
      tx('a1', SELL, 1, 16000), // продажа не влияет на avg
    ]);

    expect(positions[0].quantity).toBe(3);
    expect(positions[0].avgCostBasisMinors).toBe(12000);
  });

  it('opening-транзакция учитывается как покупка', () => {
    const positions = calculateAverageCostBasis([
      tx('a1', OPENING, 10, 5000), // существующий портфель
      tx('a1', BUY, 2, 8000),
    ]);

    expect(positions[0].quantity).toBe(12);
    // (10*5000 + 2*8000)/12 = 66000/12 = 5500
    expect(positions[0].avgCostBasisMinors).toBe(5500);
  });

  it('денежные типы (dividend/fee) не создают и не меняют позицию', () => {
    const positions = calculateAverageCostBasis([
      tx('a1', BUY, 1, 10000),
      tx('a1', TransactionType.DIVIDEND, 0, null),
      tx('a2', TransactionType.DIVIDEND, 0, null),
    ]);
    expect(positions).toHaveLength(1);
    expect(positions[0].assetId).toBe('a1');
  });

  it('разделяет позиции по разным активам', () => {
    const positions = calculateAverageCostBasis([
      tx('a1', BUY, 1, 10000),
      tx('a2', BUY, 5, 2000),
    ]);
    expect(positions).toHaveLength(2);
  });
});