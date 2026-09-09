import { AccountType, AssetType, Money } from '@finfury/contracts';
import { ExternalAssetResult, PriceProvider, AssetSearchProvider, PriceWithPrevious } from './price-provider.interface';

const BASE = 'https://iss.moex.com/iss';

/** Доски для разных типов активов */
const BOARD_MAP: Record<string, string> = {
  stock: 'TQBR',
  bond: 'TQCB',
  fund: 'TQTF',
};

/** Маппинг type из поиска → AssetType */
const TYPE_MAP: Record<string, AssetType> = {
  common_share: AssetType.STOCK,
  preferred_share: AssetType.STOCK,
  corporate_bond: AssetType.BOND,
  exchange_bond: AssetType.BOND,
  government_bond: AssetType.BOND,
  stock_etf: AssetType.FUND,
  stock_dr: AssetType.STOCK,
};

/**
 * PriceProvider и AssetSearchProvider для MOEX (Московская Биржа).
 * Покрывает российские акции, облигации и ETF.
 * API без ключа, официальный.
 */
export class MoexPriceProvider implements PriceProvider, AssetSearchProvider {
  readonly name = 'moex';

  supports(assetType: string): boolean {
    return assetType === AssetType.STOCK
      || assetType === AssetType.BOND
      || assetType === AssetType.FUND;
  }

  supportsAccountType(accountType: AccountType): boolean {
    return accountType === AccountType.BROKER;
  }

  async getPrice(symbol: string, assetType: string): Promise<Money> {
    const { current } = await this.getPriceWithPrevious(symbol, assetType);
    return current;
  }

  async getPriceWithPrevious(symbol: string, assetType: string): Promise<PriceWithPrevious> {
    const board = BOARD_MAP[assetType] ?? 'TQBR';
    const url = `${BASE}/engines/stock/markets/shares/securities/${encodeURIComponent(symbol)}.json?iss.meta=off`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`MOEX: HTTP ${res.status} для ${symbol}`);

    const json = await res.json() as MoexResponse;
    const marketdata = json.marketdata?.data ?? [];
    const securities = json.securities?.data ?? [];

    // ищем строку с нужной доской в marketdata (текущая цена)
    const mdCols = json.marketdata.columns;
    const boardIdx = mdCols.indexOf('BOARDID');
    const lastIdx = mdCols.indexOf('LAST');
    const currIdx = mdCols.indexOf('CURRENCYID');

    // PREVPRICE — в securities, не в marketdata
    const secCols = json.securities.columns;
    const secBoardIdx = secCols.indexOf('BOARDID');
    const prevIdx = secCols.indexOf('PREVPRICE');

    let price: number | null = null;
    let prevPrice: number | null = null;
    let currency = 'RUB';

    for (const row of marketdata) {
      if (row[boardIdx] === board) {
        price = row[lastIdx] as number | null;
        const rawCur = row[currIdx] as string | null;
        if (rawCur) currency = rawCur === 'SUR' ? 'RUB' : rawCur;
        break;
      }
    }

    // fallback: если нет данных по конкретной доске, берём первую не-null цену
    if (price === null) {
      for (const row of marketdata) {
        const p = row[lastIdx] as number | null;
        if (p !== null) {
          price = p;
          const rawCur = row[currIdx] as string | null;
          if (rawCur) currency = rawCur === 'SUR' ? 'RUB' : rawCur;
          break;
        }
      }
    }

    // PREVPRICE берём из securities (там PREVPRICE для каждой доски)
    for (const row of securities) {
      if (row[secBoardIdx] === board) {
        prevPrice = row[prevIdx] as number | null;
        break;
      }
    }
    if (prevPrice === null) {
      for (const row of securities) {
        const p = row[prevIdx] as number | null;
        if (p !== null) {
          prevPrice = p;
          break;
        }
      }
    }

    if (price === null) {
      throw new Error(`MOEX: нет цены для ${symbol}`);
    }

    const current: Money = { amount: Math.round(price * 100), currency };
    const previousClose: Money | null =
      prevPrice !== null ? { amount: Math.round(prevPrice * 100), currency } : null;

    return { current, previousClose };
  }

  async search(query: string): Promise<ExternalAssetResult[]> {
    const url = `${BASE}/securities.json?q=${encodeURIComponent(query)}&iss.meta=off`;
    const res = await fetch(url);
    if (!res.ok) return [];

    const json = await res.json() as MoexSearchResponse;
    const cols = json.securities.columns;
    const rows = json.securities.data ?? [];

    const secidIdx = cols.indexOf('secid');
    const nameIdx = cols.indexOf('shortname');
    const groupIdx = cols.indexOf('group');
    const typeIdx = cols.indexOf('type');
    const isinIdx = cols.indexOf('isin');
    const tradedIdx = cols.indexOf('is_traded');

    const results: ExternalAssetResult[] = [];

    for (const row of rows) {
      // только торгуемые
      if (row[tradedIdx] !== 1) continue;

      const group = row[groupIdx] as string;
      const type = row[typeIdx] as string;
      const assetType = TYPE_MAP[type] ?? (group.startsWith('stock_') ? AssetType.STOCK : undefined);
      if (!assetType) continue;

      results.push({
        symbol: row[secidIdx] as string,
        name: row[nameIdx] as string,
        type: assetType,
        currency: 'RUB',
        isin: row[isinIdx] as string | undefined,
        source: 'moex',
      });
    }

    return results;
  }
}

interface MoexResponse {
  securities: {
    columns: string[];
    data: unknown[][];
  };
  marketdata: {
    columns: string[];
    data: unknown[][];
  };
}

interface MoexSearchResponse {
  securities: {
    columns: string[];
    data: unknown[][];
  };
}
