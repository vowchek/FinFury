import { TransactionType } from '@finfury/contracts';

/** Срез транзакции для разбивки кэша (как на API). */
export interface CashTxInput {
  type: TransactionType;
  amount: number;
  fee?: number;
}

/** Составляющие денежного остатка + справочные налоги с доходов. */
export interface CashBreakdown {
  /** deposit − withdrawal */
  deposit: number;
  /** income + dividend + coupon (net, уже после налога на выплате) */
  income: number;
  /** −комиссии на buy/sell (и legacy FEE) */
  fee: number;
  /** −taxWithheld с IncomeEvent (подсказка; в total не входит — income уже net) */
  tax: number;
  /** sell − buy (без комиссии) */
  trading: number;
  /** Баланс книги: deposit + income + fee + trading */
  total: number;
}

/**
 * Разбивка кэша: комиссия из транзакций, налог — из income.taxWithheld (передаётся отдельно).
 */
export function calculateCashBreakdown(
  transactions: CashTxInput[],
  taxWithheldMinors = 0,
): CashBreakdown {
  let deposit = 0;
  let income = 0;
  let feeTotal = 0;
  let trading = 0;

  for (const tx of transactions) {
    const amount = tx.amount;
    const fee = tx.fee ?? 0;

    switch (tx.type) {
      case TransactionType.DEPOSIT:
        deposit += amount;
        break;
      case TransactionType.WITHDRAWAL:
        deposit -= amount;
        break;
      case TransactionType.INCOME:
      case TransactionType.DIVIDEND:
      case TransactionType.COUPON:
        income += amount;
        break;
      case TransactionType.BUY:
        trading -= amount;
        feeTotal -= fee;
        break;
      case TransactionType.SELL:
        trading += amount;
        feeTotal -= fee;
        break;
      case TransactionType.FEE:
        feeTotal -= amount;
        break;
      default:
        break;
    }
  }

  return {
    deposit,
    income,
    fee: feeTotal,
    tax: taxWithheldMinors ? -taxWithheldMinors : 0,
    trading,
    total: deposit + income + feeTotal + trading,
  };
}
