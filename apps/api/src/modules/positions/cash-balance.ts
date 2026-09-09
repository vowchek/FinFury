import { TransactionType } from '@finfury/contracts';

/** Стабильный sentinel id синтетической позиции «Кэш» (не FK в БД). */
export const CASH_ASSET_ID = '__cash__';

/** Минимальный срез транзакции для расчёта денежного остатка счёта. */
export interface CashTransactionInput {
  type: TransactionType;
  /** Сумма сделки в минимальных единицах. */
  amountMinors: number;
  feeMinors?: number | null;
  taxMinors?: number | null;
}

/**
 * Денежный остаток счёта (кэш) из книги.
 *
 * - deposit / income / dividend / coupon → +amount
 * - withdrawal / fee / tax → −amount
 * - buy → −(amount + fee + tax)
 * - sell → +(amount − fee − tax)
 * - opening / transfer → 0
 *
 * DRIP (income + buy на одну net-сумму) даёт ≈ 0.
 */
export function calculateCashBalance(transactions: CashTransactionInput[]): number {
  return transactions.reduce((cash, tx) => cash + cashDelta(tx), 0);
}

/** Движение кэша одной транзакции (+ поступление, − списание). */
export function cashDelta(tx: CashTransactionInput): number {
  const amount = tx.amountMinors;
  const fee = tx.feeMinors ?? 0;
  const tax = tx.taxMinors ?? 0;

  switch (tx.type) {
    case TransactionType.DEPOSIT:
    case TransactionType.INCOME:
    case TransactionType.DIVIDEND:
    case TransactionType.COUPON:
      return amount;
    case TransactionType.WITHDRAWAL:
    case TransactionType.FEE:
    case TransactionType.TAX:
      return -amount;
    case TransactionType.BUY:
      return -(amount + fee + tax);
    case TransactionType.SELL:
      return amount - fee - tax;
    case TransactionType.OPENING:
    case TransactionType.TRANSFER:
      return 0;
    default:
      return 0;
  }
}

/** Типы, которые двигают кэш (для решения, показывать ли строку при нулевом балансе). */
const CASH_AFFECTING = new Set<TransactionType>([
  TransactionType.DEPOSIT,
  TransactionType.INCOME,
  TransactionType.DIVIDEND,
  TransactionType.COUPON,
  TransactionType.WITHDRAWAL,
  TransactionType.FEE,
  TransactionType.TAX,
  TransactionType.BUY,
  TransactionType.SELL,
]);

export function hasCashAffectingTransactions(transactions: CashTransactionInput[]): boolean {
  return transactions.some((tx) => CASH_AFFECTING.has(tx.type));
}
