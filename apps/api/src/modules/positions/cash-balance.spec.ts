import { describe, expect, it } from 'vitest';
import { TransactionType } from '@finfury/contracts';
import {
  calculateCashBalance,
  hasCashAffectingTransactions,
  type CashTransactionInput,
} from './cash-balance';

function tx(
  type: TransactionType,
  amountMinors: number,
  feeMinors: number | null = null,
  taxMinors: number | null = null,
): CashTransactionInput {
  return { type, amountMinors, feeMinors, taxMinors };
}

describe('calculateCashBalance', () => {
  it('deposit + income − buy', () => {
    expect(
      calculateCashBalance([
        tx(TransactionType.DEPOSIT, 100_000),
        tx(TransactionType.INCOME, 5_000),
        tx(TransactionType.BUY, 80_000),
      ]),
    ).toBe(25_000);
  });

  it('DRIP income + buy на одну сумму → ≈ 0', () => {
    expect(
      calculateCashBalance([
        tx(TransactionType.INCOME, 10_000),
        tx(TransactionType.BUY, 10_000),
      ]),
    ).toBe(0);
  });

  it('sell учитывает fee и tax как выручку', () => {
    expect(
      calculateCashBalance([
        tx(TransactionType.SELL, 50_000, 500, 1_000),
      ]),
    ).toBe(48_500);
  });

  it('buy учитывает fee и tax сверх amount', () => {
    expect(
      calculateCashBalance([
        tx(TransactionType.DEPOSIT, 100_000),
        tx(TransactionType.BUY, 90_000, 200, 100),
      ]),
    ).toBe(9_700);
  });

  it('opening и transfer не влияют', () => {
    expect(
      calculateCashBalance([
        tx(TransactionType.OPENING, 200_000),
        tx(TransactionType.TRANSFER, 1_000),
        tx(TransactionType.DEPOSIT, 10_000),
      ]),
    ).toBe(10_000);
  });

  it('withdrawal / fee / tax уменьшают кэш', () => {
    expect(
      calculateCashBalance([
        tx(TransactionType.DEPOSIT, 100_000),
        tx(TransactionType.WITHDRAWAL, 20_000),
        tx(TransactionType.FEE, 300),
        tx(TransactionType.TAX, 700),
      ]),
    ).toBe(79_000);
  });
});

describe('hasCashAffectingTransactions', () => {
  it('false для пустого списка и только opening', () => {
    expect(hasCashAffectingTransactions([])).toBe(false);
    expect(hasCashAffectingTransactions([tx(TransactionType.OPENING, 1)])).toBe(false);
  });

  it('true при deposit/buy', () => {
    expect(hasCashAffectingTransactions([tx(TransactionType.DEPOSIT, 1)])).toBe(true);
    expect(hasCashAffectingTransactions([tx(TransactionType.BUY, 1)])).toBe(true);
  });
});
