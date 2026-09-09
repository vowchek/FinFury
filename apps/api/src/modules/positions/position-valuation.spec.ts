import { describe, expect, it } from 'vitest';
import { valuePosition } from './position-valuation';

describe('valuePosition (оценка позиции)', () => {
  it('считает стоимость и прибыль по целым количествам', () => {
    // 4 шт @ avg 120.00, текущая 150.00
    const v = valuePosition({ quantity: 4, avgCostBasisMinors: 12000, currentPriceMinors: 15000 });
    expect(v.currentValueMinors).toBe(60000);
    expect(v.costBasisMinors).toBe(48000);
    expect(v.unrealizedPnlMinors).toBe(12000);
  });

  it('округляет стоимость при дробном количестве', () => {
    // 2.5 шт @ avg 100.00, текущая 100.00
    const v = valuePosition({ quantity: 2.5, avgCostBasisMinors: 10000, currentPriceMinors: 10000 });
    expect(v.currentValueMinors).toBe(25000);
    expect(v.unrealizedPnlMinors).toBe(0);
  });

  it('убыток отрицательный при цене ниже cost basis', () => {
    const v = valuePosition({ quantity: 3, avgCostBasisMinors: 20000, currentPriceMinors: 15000 });
    expect(v.currentValueMinors).toBe(45000);
    expect(v.costBasisMinors).toBe(60000);
    expect(v.unrealizedPnlMinors).toBe(-15000);
  });
});