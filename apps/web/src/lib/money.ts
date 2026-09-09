import { AccountType, AssetType, Money } from '@finfury/contracts';

/**
 * Деньги — целые числа в минимальных единицах (ADR-002).
 * По умолчанию precision = 2 (копейки/центы).
 * Для крипты / WALLET precision = 6 (0.000001 USD) — чтобы не терять мелкие цены.
 * Ввод и отображение на одном счёте должны использовать одну и ту же precision.
 */

const SYMBOLS: Record<string, string> = {
  RUB: '₽',
  USD: '$',
  EUR: '€',
};

/** Precision для типа актива. */
export function precisionForType(type?: AssetType): number {
  return type === AssetType.CRYPTO ? 6 : 2;
}

/** Precision денежных сумм счёта (WALLET = крипта ×10⁶). */
export function precisionForAccount(type?: AccountType): number {
  return type === AccountType.WALLET ? 6 : 2;
}

/** "1234.50" → 123450 (precision=2). Пусто/не число → 0. */
export function toMinorUnits(decimal: string, precision = 2): number {
  const n = Number(decimal.replace(',', '.'));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * Math.pow(10, precision));
}

/** 123450 → "1 234,50" (округляет до 2 знаков, независимо от precision хранения). */
export function formatMinorUnits(amount: number, precision = 2): string {
  const value = amount / Math.pow(10, precision);
  return value
    .toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .replace(/\u00A0/g, ' ');
}

/** 123456 → "0,123456" (полная точность, без округления). Для tooltip. */
export function formatMinorUnitsFull(amount: number, precision = 2): string {
  const value = amount / Math.pow(10, precision);
  return value
    .toLocaleString('ru-RU', { minimumFractionDigits: precision, maximumFractionDigits: precision })
    .replace(/\u00A0/g, ' ');
}

/** Символ/код валюты для отдельной колонки в UI. */
export function currencySymbol(currency: string): string {
  return SYMBOLS[currency] ?? currency;
}

/** 123450 → "1 234,50 ₽". */
export function formatMoney(money: Money, precision = 2): string {
  return `${formatMinorUnits(money.amount, precision)} ${currencySymbol(money.currency)}`;
}

/** Сумма со знаком без валюты: "+1 234,50" / "−1 234,50". */
export function formatSignedMinorUnits(amount: number, precision = 2): string {
  const sign = amount >= 0 ? '+' : '−';
  return `${sign}${formatMinorUnits(Math.abs(amount), precision)}`;
}

/** Сумма со знаком: "+1 234,50 ₽" / "−1 234,50 ₽". */
export function formatSignedMoney(money: Money, precision = 2): string {
  return `${formatSignedMinorUnits(money.amount, precision)} ${currencySymbol(money.currency)}`;
}

/** Процент со знаком: "+12,3 %" / "−4,2 %". */
export function formatPercent(percent: number): string {
  const sign = percent >= 0 ? '+' : '−';
  const value = Math.abs(percent).toLocaleString('ru-RU', { maximumFractionDigits: 1 });
  return `${sign}${value} %`;
}

/** Доходность без знака, 2 знака: 12.5 → "12,50%". */
export function formatYieldPct(pct: number): string {
  return `${pct.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}