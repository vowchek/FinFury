import { TransactionType } from '@finfury/contracts';

/** Минимальный срез транзакции для расчёта net contributions. */
export interface ContributionTx {
  type: TransactionType;
  /** Сумма в минимальных единицах (ADR-002). */
  amount: { amount: number };
}

/**
 * Net contributions (внешний капитал счёта):
 * `Σ deposit + Σ opening − Σ withdrawal`.
 *
 * - `deposit` / `withdrawal` — ввод/вывод денег.
 * - `opening` — стартовый капитал снапшота (режим A), без двойного учёта с buy.
 * - `buy`/`sell` и доходы не входят: это внутренние движения или отдельный контур.
 */
export function netContributionsAmount(transactions: ContributionTx[]): number {
  let total = 0;
  for (const tx of transactions) {
    const amount = tx.amount.amount;
    if (tx.type === TransactionType.DEPOSIT || tx.type === TransactionType.OPENING) {
      total += amount;
    } else if (tx.type === TransactionType.WITHDRAWAL) {
      total -= amount;
    }
  }
  return total;
}
