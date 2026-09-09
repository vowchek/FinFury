import { describe, expect, it, vi } from 'vitest';
import { FxRateCache, StubFxRateProvider } from './fx-rate';
import { FrankfurterFxProvider } from './frankfurter.fx';
import { CbrFxProvider } from './cbr.fx';

describe('StubFxRateProvider', () => {
  it('одинаковая валюта → 1', async () => {
    const stub = new StubFxRateProvider();
    const r = await stub.getRate('USD', 'usd');
    expect(r.rate).toBe(1);
  });

  it('прямая и обратная пара', async () => {
    const stub = new StubFxRateProvider();
    expect((await stub.getRate('USD', 'RUB')).rate).toBe(100);
    expect((await stub.getRate('RUB', 'USD')).rate).toBeCloseTo(0.01);
  });
});

describe('FxRateCache', () => {
  it('кэширует до TTL и протухает', () => {
    const cache = new FxRateCache(1000);
    const rate = { rate: 100, from: 'USD', to: 'RUB', asOf: '2026-03-14', source: 't' };
    cache.set(rate, 1000);
    expect(cache.get('USD', 'RUB', 1500)?.rate).toBe(100);
    expect(cache.get('USD', 'RUB', 2500)).toBeNull();
  });
});

describe('FrankfurterFxProvider', () => {
  it('парсит ответ API', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ date: '2026-03-13', rates: { EUR: 0.92 } }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new FrankfurterFxProvider('https://example.test');
    const r = await provider.getRate('USD', 'EUR');
    expect(r).toEqual({
      rate: 0.92,
      from: 'USD',
      to: 'EUR',
      asOf: '2026-03-13',
      source: 'frankfurter',
    });
    expect(fetchMock).toHaveBeenCalledWith('https://example.test/latest?from=USD&to=EUR');

    vi.unstubAllGlobals();
  });
});

describe('CbrFxProvider', () => {
  it('USD→RUB и RUB→USD из daily JSON', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        Date: '2026-03-14T11:30:00+03:00',
        Valute: {
          USD: { CharCode: 'USD', Nominal: 1, Value: 90 },
          EUR: { CharCode: 'EUR', Nominal: 1, Value: 99 },
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new CbrFxProvider('https://example.test/daily.json');
    expect((await provider.getRate('USD', 'RUB')).rate).toBe(90);
    expect((await provider.getRate('RUB', 'USD')).rate).toBeCloseTo(1 / 90);
    expect((await provider.getRate('EUR', 'RUB')).rate).toBe(99);

    vi.unstubAllGlobals();
  });

  it('отклоняет пары без RUB', async () => {
    const provider = new CbrFxProvider();
    await expect(provider.getRate('USD', 'EUR')).rejects.toThrow(/RUB/);
  });
});
