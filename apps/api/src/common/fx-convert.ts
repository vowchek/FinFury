/**
 * FX-конвертация minors (ADR-009 / ADR-002).
 * Никогда не складываем суммы разных currency/precision без явного курса.
 */

/** Scale представления mid-rate (9 знаков после запятой). */
const RATE_SCALE = 1_000_000_000n;

/**
 * Конвертирует сумму в минимальных единицах из одной валюты/scale в другую.
 *
 * @param amountMinors — целое в scale `fromPrecision`
 * @param fromPrecision — 2 (фиат) или 6 (WALLET/крипта)
 * @param toPrecision — scale целевой валюты
 * @param rate — сколько единиц `to` (major) за 1 единицу `from` (major), mid-rate
 * @returns целые minors в `toPrecision`, half-up
 */
export function convertMoney(
  amountMinors: number,
  fromPrecision: number,
  toPrecision: number,
  rate: number,
): number {
  if (!Number.isFinite(amountMinors) || !Number.isInteger(amountMinors)) {
    throw new Error('amountMinors must be a finite integer');
  }
  if (!Number.isInteger(fromPrecision) || fromPrecision < 0 || fromPrecision > 12) {
    throw new Error('invalid fromPrecision');
  }
  if (!Number.isInteger(toPrecision) || toPrecision < 0 || toPrecision > 12) {
    throw new Error('invalid toPrecision');
  }
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error('rate must be a positive finite number');
  }

  // amount * rate * 10^to / 10^from, с rate в фиксированной точке
  const rateScaled = BigInt(Math.round(rate * Number(RATE_SCALE)));
  if (rateScaled <= 0n) throw new Error('rate too small');

  const fromScale = 10n ** BigInt(fromPrecision);
  const toScale = 10n ** BigInt(toPrecision);
  const signed = BigInt(amountMinors);
  const negative = signed < 0n;
  const abs = negative ? -signed : signed;

  const numerator = abs * rateScaled * toScale;
  const denominator = fromScale * RATE_SCALE;
  // half-up
  const rounded = (numerator + denominator / 2n) / denominator;
  const result = negative ? -rounded : rounded;

  const asNumber = Number(result);
  if (!Number.isSafeInteger(asNumber)) {
    throw new Error('converted amount exceeds safe integer range');
  }
  return asNumber;
}

/** Precision валюты отображения на дашборде (всегда фиатный scale). */
export function precisionForDisplayCurrency(_currency: string): number {
  return 2;
}

/** Precision хранения счёта. */
export function precisionForAccountType(type: string): number {
  return type === 'wallet' ? 6 : 2;
}

/** Precision суммы по типу актива (крипта ×10⁶, иначе фиат ×100). */
export function precisionForAssetType(assetType?: string): number {
  return assetType === 'crypto' ? 6 : 2;
}

export const DISPLAY_CURRENCIES = ['RUB', 'USD', 'EUR'] as const;
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];

export function isDisplayCurrency(code: string): code is DisplayCurrency {
  return (DISPLAY_CURRENCIES as readonly string[]).includes(code.toUpperCase());
}
