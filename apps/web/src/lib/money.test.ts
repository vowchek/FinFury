import { describe, expect, it } from 'vitest';
import {
  currencySymbol,
  formatMinorUnits,
  formatMoney,
  formatPercent,
  formatSignedMinorUnits,
  formatSignedMoney,
  formatYieldPct,
  toMinorUnits,
} from './money';

describe('toMinorUnits', () => {
  it('парсит точку и запятую', () => {
    expect(toMinorUnits('1234.50')).toBe(123450);
    expect(toMinorUnits('1234,50')).toBe(123450);
  });

  it('округляет до целых минимальных единиц', () => {
    expect(toMinorUnits('1.006')).toBe(101);
    expect(toMinorUnits('1.004')).toBe(100);
  });

  it('precision 6: ввод 111111 → отображение 111 111,00', () => {
    const minor = toMinorUnits('111111', 6);
    expect(minor).toBe(111_111_000_000);
    expect(formatMoney({ amount: minor, currency: 'USD' }, 6)).toBe('111 111,00 $');
    // ошибочный precision 2 даёт ×10 000 — регрессия бага WALLET
    expect(formatMoney({ amount: minor, currency: 'USD' }, 2)).toBe('1 111 110 000,00 $');
  });
});

describe('formatMinorUnits / formatMoney', () => {
  it('форматирует сумму без валюты', () => {
    expect(formatMinorUnits(123450)).toBe('1 234,50');
  });

  it('подставляет символ известных валют', () => {
    expect(formatMoney({ amount: 123450, currency: 'RUB' })).toBe('1 234,50 ₽');
    expect(formatMoney({ amount: 100, currency: 'USD' })).toBe('1,00 $');
    expect(formatMoney({ amount: 100, currency: 'EUR' })).toBe('1,00 €');
  });

  it('неизвестная валюта — код как есть', () => {
    expect(formatMoney({ amount: 100, currency: 'KZT' })).toBe('1,00 KZT');
  });
});

describe('formatSignedMoney / formatPercent / formatYieldPct', () => {
  it('символ валюты и сумма со знаком без валюты', () => {
    expect(currencySymbol('RUB')).toBe('₽');
    expect(formatSignedMinorUnits(123450)).toBe('+1 234,50');
    expect(formatSignedMinorUnits(-500)).toBe('−5,00');
  });

  it('положительная и отрицательная сумма со знаком', () => {
    expect(formatSignedMoney({ amount: 123450, currency: 'RUB' })).toBe('+1 234,50 ₽');
    expect(formatSignedMoney({ amount: -500, currency: 'RUB' })).toBe('−5,00 ₽');
  });

  it('процент со знаком', () => {
    expect(formatPercent(12.3)).toBe('+12,3 %');
    expect(formatPercent(-4.2)).toBe('−4,2 %');
  });

  it('доходность без знака, 2 знака', () => {
    expect(formatYieldPct(12.5)).toBe('12,50%');
    expect(formatYieldPct(0)).toBe('0,00%');
  });
});
