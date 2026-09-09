import { TransactionType } from '@finfury/contracts';

/** Человекочитаемые названия типов транзакций для UI. */
export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  [TransactionType.BUY]: 'Покупка',
  [TransactionType.SELL]: 'Продажа',
  [TransactionType.DIVIDEND]: 'Дивиденд',
  [TransactionType.COUPON]: 'Купон',
  [TransactionType.FEE]: 'Комиссия',
  [TransactionType.TAX]: 'Налог',
  [TransactionType.DEPOSIT]: 'Ввод денег',
  [TransactionType.WITHDRAWAL]: 'Вывод денег',
  [TransactionType.TRANSFER]: 'Перевод',
  [TransactionType.OPENING]: 'Стартовые позиции',
  [TransactionType.INCOME]: 'Доход',
};

export function transactionTypeLabel(type: TransactionType): string {
  return TRANSACTION_TYPE_LABELS[type] ?? type;
}
