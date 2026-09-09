import { AccountType, AssetType, Money } from '@finfury/contracts';
import { ExternalAssetResult, PriceProvider, AssetSearchProvider, PriceWithPrevious } from './price-provider.interface';
import { RateLimiter } from './rate-limiter';

const BASE = 'https://api.coingecko.com/api/v3';

/**
 * PriceProvider и AssetSearchProvider для CoinGecko.
 * Покрывает криптовалюты.
 * API без ключа, 10-30 req/min.
 *
 * В результатах поиска symbol = тикер (напр. ATOM), isin = CoinGecko id (slug, напр. cosmos).
 * Для getPrice используется lookupKey (CoinGecko id) если передан, иначе symbol.
 */
export class CoinGeckoProvider implements PriceProvider, AssetSearchProvider {
  readonly name = 'coingecko';

  private readonly limiter = new RateLimiter(30); // 30 req/min — макс для free tier

  supports(assetType: string): boolean {
    return assetType === AssetType.CRYPTO;
  }

  supportsAccountType(accountType: AccountType): boolean {
    return accountType === AccountType.WALLET;
  }

  async getPrice(symbol: string, _assetType: string, lookupKey?: string): Promise<Money> {
    this.limiter.check();

    const id = lookupKey ?? symbol;
    const url = `${BASE}/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`CoinGecko: HTTP ${res.status} для ${id}`);

    const json = await res.json() as Record<string, { usd?: number }>;
    const coin = json[id];
    if (!coin || coin.usd === undefined) {
      throw new Error(`CoinGecko: нет цены для ${id}`);
    }

    return { amount: Math.round(coin.usd * 1_000_000), currency: 'USD' };
  }

  async getPriceWithPrevious(symbol: string, _assetType: string, lookupKey?: string): Promise<PriceWithPrevious> {
    this.limiter.check();

    const id = lookupKey ?? symbol;
    // /coins/{id} отдаёт current_price + price_change_24h_in_currency за один запрос
    const url = `${BASE}/coins/${encodeURIComponent(id)}?localization=false&tickers=false&community_data=false&developer_data=false`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`CoinGecko: HTTP ${res.status} для ${id}`);

    const json = await res.json() as CoinGeckoCoinResponse;
    const md = json.market_data;
    if (!md?.current_price?.usd) {
      throw new Error(`CoinGecko: нет цены для ${id}`);
    }

    const currentUsd = md.current_price.usd;
    const change24hUsd = md.price_change_24h_in_currency?.usd;
    const currency = 'USD';

    const current: Money = { amount: Math.round(currentUsd * 1_000_000), currency };
    let previousClose: Money | null = null;
    if (change24hUsd !== undefined && change24hUsd !== null) {
      const prevUsd = currentUsd - change24hUsd;
      previousClose = { amount: Math.round(prevUsd * 1_000_000), currency };
    }

    return { current, previousClose };
  }

  async search(query: string): Promise<ExternalAssetResult[]> {
    this.limiter.check();

    const url = `${BASE}/search?query=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    if (!res.ok) return [];

    const json = await res.json() as CoinGeckoSearchResponse;
    const coins = json.coins ?? [];

    // дедупликация по id: оставляем первое вхождение каждого id
    const seen = new Set<string>();
    const results: ExternalAssetResult[] = [];

    for (const coin of coins) {
      if (seen.has(coin.id)) continue;
      seen.add(coin.id);

      results.push({
        symbol: coin.symbol, // тикер (ATOM)
        name: coin.name,
        type: AssetType.CRYPTO,
        currency: 'USD',
        isin: coin.id, // CoinGecko slug (cosmos) — для getPrice
        source: 'coingecko',
      });
    }

    return results;
  }
}

interface CoinGeckoSearchResponse {
  coins?: Array<{
    id: string;
    name: string;
    symbol: string;
    market_cap_rank?: number;
  }>;
}

interface CoinGeckoCoinResponse {
  market_data?: {
    current_price?: { usd?: number };
    price_change_24h_in_currency?: { usd?: number };
  };
}