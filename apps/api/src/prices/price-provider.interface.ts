import { AccountType, AssetType, Money } from '@finfury/contracts';

/** Цена актива: текущая и цена предыдущего закрытия. */
export interface PriceWithPrevious {
  current: Money;
  /** Цена на закрытие предыдущего торгового дня. null — нет данных. */
  previousClose: Money | null;
}

/**
 * Абстракция источника цен (ADR-005).
 * Бизнес-логика обращается только к этому интерфейсу,
 * никогда напрямую к внешним API.
 */
export interface PriceProvider {
  /** Идентификатор провайдера (для кэша и отладки) */
  readonly name: string;

  /** Поддерживает ли провайдер данный тип актива */
  supports(assetType: string): boolean;

  /** Текущая цена актива. lookupKey — опциональный ключ для провайдера (напр. CoinGecko id). */
  getPrice(symbol: string, assetType: string, lookupKey?: string): Promise<Money>;

  /**
   * Текущая цена + цена предыдущего закрытия.
   * По умолчанию возвращает { current, previousClose: null }.
   * Провайдеры, которые могут отдать обе цены за один запрос, переопределяют этот метод.
   */
  getPriceWithPrevious?(symbol: string, assetType: string, lookupKey?: string): Promise<PriceWithPrevious>;
}

/** Результат поиска актива во внешнем источнике. */
export interface ExternalAssetResult {
  symbol: string;
  name: string;
  type: AssetType;
  currency: string;
  isin?: string;
  source: string;
}

/**
 * Провайдер поиска активов во внешних источниках.
 * Может быть реализован тем же классом, что и PriceProvider.
 */
export interface AssetSearchProvider {
  readonly name: string;
  /** Какие типы счетов поддерживает этот поиск */
  supportsAccountType(accountType: AccountType): boolean;
  /** Поиск активов по запросу */
  search(query: string): Promise<ExternalAssetResult[]>;
}