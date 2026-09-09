import { describe, expect, it } from 'vitest';
import {
  convertMoney,
  isDisplayCurrency,
  precisionForAccountType,
  precisionForDisplayCurrency,
} from './fx-convert';

describe('convertMoney', () => {
  it('RUB×100 → USD×100 при rate 1/100 (100 RUB = 1 USD)', () => {
    // 100.00 RUB = 10000 minors → 1.00 USD = 100 minors при rate 0.01
    expect(convertMoney(10_000, 2, 2, 0.01)).toBe(100);
  });

  it('USD×1e6 → RUB×100 без «прилипания» minors (баг 103M ₽)', () => {
    // 10_000.00 USD при precision 6 = 10_000_000_000 minors
    // rate USD→RUB = 100 → 1_000_000.00 RUB = 100_000_000 kopecks
    expect(convertMoney(10_000_000_000, 6, 2, 100)).toBe(100_000_000);
  });

  it('USD p6 → USD p2 (rate 1, только смена scale)', () => {
    expect(convertMoney(10_000_000_000, 6, 2, 1)).toBe(1_000_000); // 10000.00
  });

  it('RUB p2 → USD p6', () => {
    // 10000.00 RUB / 100 = 100.00 USD → 100_000_000 minors @ p6
    expect(convertMoney(1_000_000, 2, 6, 0.01)).toBe(100_000_000);
  });

  it('отрицательные суммы сохраняют знак', () => {
    expect(convertMoney(-10_000, 2, 2, 0.01)).toBe(-100);
  });

  it('half-up округление', () => {
    // 1 minor RUB * 0.015 → 0.00015 USD @ p2 → rounds?
    // 1 * 0.5 * 100 / 100 = 0.5 → half-up → 1
    expect(convertMoney(1, 2, 2, 0.5)).toBe(1);
  });

  it('отклоняет невалидный rate', () => {
    expect(() => convertMoney(100, 2, 2, 0)).toThrow();
    expect(() => convertMoney(100, 2, 2, -1)).toThrow();
  });
});

describe('precision helpers', () => {
  it('display currency всегда precision 2', () => {
    expect(precisionForDisplayCurrency('USD')).toBe(2);
    expect(precisionForDisplayCurrency('RUB')).toBe(2);
  });

  it('wallet → 6, иначе 2', () => {
    expect(precisionForAccountType('wallet')).toBe(6);
    expect(precisionForAccountType('broker')).toBe(2);
  });

  it('isDisplayCurrency', () => {
    expect(isDisplayCurrency('USD')).toBe(true);
    expect(isDisplayCurrency('gbp')).toBe(false);
  });
});
