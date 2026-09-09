import { describe, expect, it } from 'vitest';
import { TransactionType } from '@finfury/contracts';
import { calculateCashBreakdown } from './cash-breakdown';

describe('calculateCashBreakdown', () => {
  it('разделяет депозит и доход', () => {
    const b = calculateCashBreakdown([
      { type: TransactionType.DEPOSIT, amount: 100_000 },
      { type: TransactionType.INCOME, amount: 5_000 },
      { type: TransactionType.WITHDRAWAL, amount: 10_000 },
    ]);
    expect(b.deposit).toBe(90_000);
    expect(b.income).toBe(5_000);
    expect(b.fee).toBe(0);
    expect(b.tax).toBe(0);
    expect(b.trading).toBe(0);
    expect(b.total).toBe(95_000);
  });

  it('комиссия из сделок, налог из income.taxWithheld', () => {
    const b = calculateCashBreakdown(
      [
        { type: TransactionType.DEPOSIT, amount: 100_000 },
        { type: TransactionType.BUY, amount: 40_000, fee: 100 },
        { type: TransactionType.SELL, amount: 20_000, fee: 50 },
      ],
      700,
    );
    expect(b.trading).toBe(-40_000 + 20_000);
    expect(b.fee).toBe(-(100 + 50));
    expect(b.tax).toBe(-700);
    expect(b.total).toBe(b.deposit + b.income + b.fee + b.trading);
  });
});
