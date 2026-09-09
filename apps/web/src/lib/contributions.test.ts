import { describe, expect, it } from 'vitest';
import { TransactionType } from '@finfury/contracts';
import { netContributionsAmount } from './contributions';

function tx(type: TransactionType, amount: number) {
  return { type, amount: { amount } };
}

describe('netContributionsAmount', () => {
  it('deposit увеличивает, withdrawal уменьшает', () => {
    expect(
      netContributionsAmount([
        tx(TransactionType.DEPOSIT, 100_000),
        tx(TransactionType.WITHDRAWAL, 20_000),
      ]),
    ).toBe(80_000);
  });

  it('opening входит как стартовый капитал', () => {
    expect(
      netContributionsAmount([
        tx(TransactionType.OPENING, 50_000),
        tx(TransactionType.DEPOSIT, 10_000),
      ]),
    ).toBe(60_000);
  });

  it('buy/sell/income/fee не влияют (нет double-count с deposit)', () => {
    expect(
      netContributionsAmount([
        tx(TransactionType.DEPOSIT, 100_000),
        tx(TransactionType.BUY, 80_000),
        tx(TransactionType.SELL, 30_000),
        tx(TransactionType.FEE, 500),
        tx(TransactionType.INCOME, 1_000),
        tx(TransactionType.DIVIDEND, 2_000),
      ]),
    ).toBe(100_000);
  });

  it('пустой список → 0', () => {
    expect(netContributionsAmount([])).toBe(0);
  });
});
