import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssetType } from '@finfury/contracts';
import { PriceCache, StubPriceProvider } from './price-cache';
import { PriceProvider, PriceWithPrevious } from './price-provider.interface';
import { PriceService } from './price.service';

afterEach(() => {
  vi.useRealTimers();
});

describe('PriceCache', () => {
  it('возвращает значение до истечения TTL', () => {
    const cache = new PriceCache(60_000);
    cache.set('GAZP', AssetType.STOCK, { amount: 10000, currency: 'RUB' });
    expect(cache.get('GAZP', AssetType.STOCK)).toEqual({
      amount: 10000,
      currency: 'RUB',
    });
  });

  it('после TTL возвращает null', () => {
    vi.useFakeTimers();
    const cache = new PriceCache(1000);
    cache.set('GAZP', AssetType.STOCK, { amount: 10000, currency: 'RUB' });
    vi.advanceTimersByTime(1001);
    expect(cache.get('GAZP', AssetType.STOCK)).toBeNull();
  });

  it('miss по другому символу/типу', () => {
    const cache = new PriceCache();
    cache.set('GAZP', AssetType.STOCK, { amount: 1, currency: 'RUB' });
    expect(cache.get('SBER', AssetType.STOCK)).toBeNull();
    expect(cache.get('GAZP', AssetType.BOND)).toBeNull();
  });

  it('getWithPrevious отдаёт пару, пока TTL current и тот же UTC-день', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T12:00:00.000Z'));
    const cache = new PriceCache(900_000);
    cache.setWithPrevious('GAZP', AssetType.STOCK, {
      current: { amount: 200, currency: 'RUB' },
      previousClose: { amount: 190, currency: 'RUB' },
    });
    expect(cache.getWithPrevious('GAZP', AssetType.STOCK)).toEqual({
      current: { amount: 200, currency: 'RUB' },
      previousClose: { amount: 190, currency: 'RUB' },
    });

    vi.advanceTimersByTime(900_001);
    expect(cache.getWithPrevious('GAZP', AssetType.STOCK)).toBeNull();
    expect(cache.getPreviousCloseForToday('GAZP', AssetType.STOCK)).toEqual({
      amount: 190,
      currency: 'RUB',
    });
  });

  it('после смены UTC-дня previousClose сбрасывается', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T23:00:00.000Z'));
    const cache = new PriceCache(900_000);
    cache.setWithPrevious('GAZP', AssetType.STOCK, {
      current: { amount: 200, currency: 'RUB' },
      previousClose: { amount: 190, currency: 'RUB' },
    });

    vi.setSystemTime(new Date('2026-03-16T00:00:01.000Z'));
    expect(cache.getWithPrevious('GAZP', AssetType.STOCK)).toBeNull();
    expect(cache.getPreviousCloseForToday('GAZP', AssetType.STOCK)).toBeUndefined();
  });

  it('set сохраняет previousClose за сегодня', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T12:00:00.000Z'));
    const cache = new PriceCache(1000);
    cache.setWithPrevious('GAZP', AssetType.STOCK, {
      current: { amount: 200, currency: 'RUB' },
      previousClose: { amount: 190, currency: 'RUB' },
    });
    vi.advanceTimersByTime(1001);
    cache.set('GAZP', AssetType.STOCK, { amount: 210, currency: 'RUB' });
    expect(cache.getPreviousCloseForToday('GAZP', AssetType.STOCK)).toEqual({
      amount: 190,
      currency: 'RUB',
    });
    expect(cache.get('GAZP', AssetType.STOCK)?.amount).toBe(210);
  });
});

describe('StubPriceProvider', () => {
  it('всегда поддерживает тип и отдаёт фиксированную цену', async () => {
    const provider = new StubPriceProvider();
    expect(provider.supports()).toBe(true);
    await expect(provider.getPrice('ANY')).resolves.toEqual({
      amount: 10000,
      currency: 'RUB',
    });
  });

  it('getPriceWithPrevious возвращает current = previousClose', async () => {
    const provider = new StubPriceProvider();
    const result = await provider.getPriceWithPrevious('ANY');
    expect(result.current).toEqual({ amount: 10000, currency: 'RUB' });
    expect(result.previousClose).toEqual(result.current);
  });
});

describe('PriceService', () => {
  it('обходит провайдеров по supports() и кэширует результат', async () => {
    const providerA: PriceProvider = {
      name: 'a',
      supports: (t) => t === AssetType.BOND,
      getPrice: async () => ({ amount: 100, currency: 'RUB' }),
    };
    const providerB: PriceProvider = {
      name: 'b',
      supports: (t) => t === AssetType.STOCK,
      getPrice: async () => ({ amount: 200, currency: 'USD' }),
    };

    const service = new PriceService();
    (service as any).providers = [providerA, providerB];

    const price = await service.getPrice('TEST', AssetType.STOCK);
    expect(price).toEqual({ amount: 200, currency: 'USD' });

    const cached = await service.getPrice('TEST', AssetType.STOCK);
    expect(cached).toEqual(price);
  });

  it('fallback при ошибке первого провайдера', async () => {
    const fail: PriceProvider = {
      name: 'fail',
      supports: () => true,
      getPrice: async () => {
        throw new Error('fail');
      },
    };
    const ok: PriceProvider = {
      name: 'ok',
      supports: () => true,
      getPrice: async () => ({ amount: 999, currency: 'EUR' }),
    };

    const service = new PriceService();
    (service as any).providers = [fail, ok];

    const price = await service.getPrice('X', AssetType.STOCK);
    expect(price).toEqual({ amount: 999, currency: 'EUR' });
  });

  it('getPriceWithPrevious использует провайдера с этим методом', async () => {
    const withPrev: PriceProvider & { getPriceWithPrevious: Function } = {
      name: 'with-prev',
      supports: () => true,
      getPrice: async () => ({ amount: 100, currency: 'RUB' }),
      getPriceWithPrevious: async (): Promise<PriceWithPrevious> => ({
        current: { amount: 200, currency: 'USD' },
        previousClose: { amount: 190, currency: 'USD' },
      }),
    };
    const withoutPrev: PriceProvider = {
      name: 'without-prev',
      supports: () => true,
      getPrice: async () => ({ amount: 300, currency: 'EUR' }),
    };

    const service = new PriceService();
    (service as any).providers = [withoutPrev, withPrev];

    const result = await service.getPriceWithPrevious('TEST', AssetType.STOCK);
    expect(result.current).toEqual({ amount: 200, currency: 'USD' });
    expect(result.previousClose).toEqual({ amount: 190, currency: 'USD' });
  });

  it('getPriceWithPrevious fallback на getPrice если нет провайдера с методом', async () => {
    const provider: PriceProvider = {
      name: 'plain',
      supports: () => true,
      getPrice: async () => ({ amount: 500, currency: 'RUB' }),
    };

    const service = new PriceService();
    (service as any).providers = [provider];

    const result = await service.getPriceWithPrevious('TEST', AssetType.STOCK);
    expect(result.current).toEqual({ amount: 500, currency: 'RUB' });
    expect(result.previousClose).toBeNull();
  });

  it('getPriceWithPrevious не ходит к провайдеру повторно в тот же день (TTL)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T10:00:00.000Z'));

    const getPriceWithPrevious = vi.fn(async (): Promise<PriceWithPrevious> => ({
      current: { amount: 200, currency: 'RUB' },
      previousClose: { amount: 190, currency: 'RUB' },
    }));
    const provider: PriceProvider = {
      name: 'counted',
      supports: () => true,
      getPrice: async () => ({ amount: 200, currency: 'RUB' }),
      getPriceWithPrevious,
    };

    const service = new PriceService();
    (service as any).providers = [provider];
    (service as any).cache = new PriceCache(900_000);

    await service.getPriceWithPrevious('TEST', AssetType.STOCK);
    await service.getPriceWithPrevious('TEST', AssetType.STOCK);
    expect(getPriceWithPrevious).toHaveBeenCalledTimes(1);

    // после TTL current — обновляем только через getPrice, previousClose из кэша дня
    const getPrice = vi.fn(async () => ({ amount: 205, currency: 'RUB' }));
    (provider as any).getPrice = getPrice;
    vi.advanceTimersByTime(900_001);

    const refreshed = await service.getPriceWithPrevious('TEST', AssetType.STOCK);
    expect(getPriceWithPrevious).toHaveBeenCalledTimes(1);
    expect(getPrice).toHaveBeenCalledTimes(1);
    expect(refreshed).toEqual({
      current: { amount: 205, currency: 'RUB' },
      previousClose: { amount: 190, currency: 'RUB' },
    });
  });
});
