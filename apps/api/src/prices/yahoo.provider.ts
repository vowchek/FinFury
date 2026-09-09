import YahooFinance from 'yahoo-finance2';
import { AccountType, AssetType, Money } from '@finfury/contracts';
import { ExternalAssetResult, PriceProvider, AssetSearchProvider, PriceWithPrevious } from './price-provider.interface';
import { RateLimiter } from './rate-limiter';

const yahooFinance = new YahooFinance();

/** Маппинг Yahoo type → AssetType */
const YAHOO_TYPE_MAP: Record<string, AssetType> = {
  EQUITY: AssetType.STOCK,
  ETF: AssetType.FUND,
  BOND: AssetType.BOND,
  MUTUALFUND: AssetType.FUND,
};

interface YahooQuote {
  symbol?: string;
  shortname?: string;
  longname?: string;
  quoteType?: string;
  currency?: string;
}

/**
 * PriceProvider и AssetSearchProvider для Yahoo Finance.
 * Покрывает иностранные акции, ETF.
 * Использует npm-пакет yahoo-finance2 (неофициальный, без ключа).
 */
export class YahooPriceProvider implements PriceProvider, AssetSearchProvider {
  readonly name = 'yahoo';

  private readonly limiter = new RateLimiter(60); // 60 req/min — щадящий режим

  supports(assetType: string): boolean {
    return assetType === AssetType.STOCK || assetType === AssetType.FUND || assetType === AssetType.BOND;
  }

  supportsAccountType(accountType: AccountType): boolean {
    return accountType === AccountType.BROKER;
  }

  async getPrice(symbol: string, _assetType: string): Promise<Money> {
    const { current } = await this.getPriceWithPrevious(symbol, _assetType);
    return current;
  }

  async getPriceWithPrevious(symbol: string, _assetType: string): Promise<PriceWithPrevious> {
    this.limiter.check();

    const quote = await yahooFinance.quote(symbol);

    if (quote.regularMarketPrice === undefined || quote.regularMarketPrice === null) {
      throw new Error(`Yahoo: нет цены для ${symbol}`);
    }

    const price = quote.regularMarketPrice;
    const prev = quote.regularMarketPreviousClose;
    const currency = quote.currency ?? 'USD';

    const current: Money = { amount: Math.round(price * 100), currency };
    const previousClose: Money | null =
      prev !== undefined && prev !== null
        ? { amount: Math.round(prev * 100), currency }
        : null;

    return { current, previousClose };
  }

  async search(query: string): Promise<ExternalAssetResult[]> {
    this.limiter.check();

    const results = await yahooFinance.search(query);
    const quotes = (results.quotes ?? []) as unknown as YahooQuote[];

    const out: ExternalAssetResult[] = [];

    for (const q of quotes) {
      const yahooType = q.quoteType ?? '';
      const assetType = YAHOO_TYPE_MAP[yahooType];
      if (!assetType) continue;
      if (!q.symbol) continue;

      out.push({
        symbol: q.symbol,
        name: q.shortname ?? q.longname ?? q.symbol,
        type: assetType,
        currency: q.currency ?? 'USD',
        source: 'yahoo',
      });
    }

    return out;
  }
}
