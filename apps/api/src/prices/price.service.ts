import { Injectable } from '@nestjs/common';
import { AccountType, AssetType, Money } from '@finfury/contracts';
import { PriceCache } from './price-cache';
import { PriceProvider, AssetSearchProvider, ExternalAssetResult, PriceWithPrevious } from './price-provider.interface';
import { MoexPriceProvider } from './moex.provider';
import { YahooPriceProvider } from './yahoo.provider';
import { CoinGeckoProvider } from './coingecko.provider';
import { FxRate, FxRateCache, FxRateProvider } from './fx-rate';
import { FrankfurterFxProvider } from './frankfurter.fx';
import { CbrFxProvider } from './cbr.fx';

/**
 * Сервис цен и FX (ADR-005, ADR-009). Единственная точка входа.
 * Кэш: текущая цена TTL 15 мин; previousClose — на календарный день (UTC);
 * FX mid-rate — TTL 15 мин (выходной = последний торговый день у провайдера).
 */
@Injectable()
export class PriceService {
  private readonly cache = new PriceCache();
  private readonly fxCache = new FxRateCache();
  private readonly providers: PriceProvider[];
  private readonly searchProviders: AssetSearchProvider[];
  private readonly fxProviders: FxRateProvider[];

  constructor() {
    const moex = new MoexPriceProvider();
    const yahoo = new YahooPriceProvider();
    const coingecko = new CoinGeckoProvider();

    this.providers = [moex, yahoo, coingecko];
    this.searchProviders = [moex, yahoo, coingecko];
    // CBR первым: пары с RUB (ECB/Frankfurter RUB не отдаёт). Frankfurter — USD/EUR и пр.
    this.fxProviders = [new CbrFxProvider(), new FrankfurterFxProvider()];
  }

  async getPrice(symbol: string, assetType: AssetType, lookupKey?: string): Promise<Money> {
    const cached = this.cache.get(symbol, assetType);
    if (cached) return cached;

    for (const provider of this.providers) {
      if (!provider.supports(assetType)) continue;
      try {
        const price = await provider.getPrice(symbol, assetType, lookupKey);
        this.cache.set(symbol, assetType, price);
        return price;
      } catch {
        continue;
      }
    }

    throw new Error(`Нет источника цены для ${symbol} (${assetType})`);
  }

  async getPriceWithPrevious(symbol: string, assetType: AssetType, lookupKey?: string): Promise<PriceWithPrevious> {
    const cachedPair = this.cache.getWithPrevious(symbol, assetType);
    if (cachedPair) return cachedPair;

    // previousClose на сегодня уже есть — обновляем только current (TTL истёк)
    const knownPrev = this.cache.getPreviousCloseForToday(symbol, assetType);
    if (knownPrev !== undefined) {
      const current = await this.getPrice(symbol, assetType, lookupKey);
      this.cache.setWithPrevious(symbol, assetType, { current, previousClose: knownPrev });
      return { current, previousClose: knownPrev };
    }

    for (const provider of this.providers) {
      if (!provider.supports(assetType)) continue;
      if (!provider.getPriceWithPrevious) continue;
      try {
        const result = await provider.getPriceWithPrevious(symbol, assetType, lookupKey);
        this.cache.setWithPrevious(symbol, assetType, result);
        return result;
      } catch {
        continue;
      }
    }

    const current = await this.getPrice(symbol, assetType, lookupKey);
    const fallback: PriceWithPrevious = { current, previousClose: null };
    this.cache.setWithPrevious(symbol, assetType, fallback);
    return fallback;
  }

  /**
   * Поиск активов во внешних источниках в зависимости от типа счёта.
   */
  async searchExternal(query: string, accountType: AccountType): Promise<ExternalAssetResult[]> {
    const results: ExternalAssetResult[] = [];

    for (const provider of this.searchProviders) {
      if (!provider.supportsAccountType(accountType)) continue;
      try {
        const found = await provider.search(query);
        results.push(...found);
      } catch {
        continue;
      }
    }

    return results;
  }

  /**
   * Mid-rate from→to (ADR-009). Одинаковые валюты → 1 без сети.
   * Кэш 15 мин; fallback по цепочке fxProviders.
   */
  async getFxRate(from: string, to: string): Promise<FxRate> {
    const f = from.toUpperCase();
    const t = to.toUpperCase();
    if (f === t) {
      return {
        rate: 1,
        from: f,
        to: t,
        asOf: new Date().toISOString().slice(0, 10),
        source: 'identity',
      };
    }

    const cached = this.fxCache.get(f, t);
    if (cached) return cached;

    // Инверсия уже закэшированной прямой пары
    const inverseCached = this.fxCache.get(t, f);
    if (inverseCached && inverseCached.rate !== 0) {
      const inverted: FxRate = {
        rate: 1 / inverseCached.rate,
        from: f,
        to: t,
        asOf: inverseCached.asOf,
        source: inverseCached.source,
      };
      this.fxCache.set(inverted);
      return inverted;
    }

    for (const provider of this.fxProviders) {
      try {
        const rate = await provider.getRate(f, t);
        this.fxCache.set(rate);
        return rate;
      } catch {
        continue;
      }
    }

    throw new Error(`Нет источника FX для ${f}/${t}`);
  }
}
