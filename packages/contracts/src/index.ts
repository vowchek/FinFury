/**
 * Общие типы контрактов API.
 * Деньги — целые числа в минимальных единицах + код валюты (ADR-002).
 * Никогда не используем float для денег.
 */

/** ISO 4217 код валюты */
export type CurrencyCode = string;

/** Сумма в минимальных единицах (копейки/сатоши) + валюта */
export interface Money {
  /** Целое число в минимальных единицах. Пример: 12345 = 123.45 валюты */
  amount: number;
  currency: CurrencyCode;
}

export enum TransactionType {
  BUY = 'buy',
  SELL = 'sell',
  DIVIDEND = 'dividend',
  COUPON = 'coupon',
  FEE = 'fee',
  TAX = 'tax',
  DEPOSIT = 'deposit',
  WITHDRAWAL = 'withdrawal',
  TRANSFER = 'transfer',
  OPENING = 'opening',
  INCOME = 'income',
}

export enum AssetType {
  STOCK = 'stock',
  BOND = 'bond',
  FUND = 'fund',
  CRYPTO = 'crypto',
  CASH = 'cash',
  FX = 'fx',
}

export enum AccountType {
  BROKER = 'broker',
  WALLET = 'wallet',
  CASH = 'cash',
}

export enum IncomeEventType {
  DIVIDEND = 'dividend',
  COUPON = 'coupon',
  INTEREST = 'interest',
  DISTRIBUTION = 'distribution',
}

export enum ImportSourceType {
  MANUAL = 'manual',
  BROKER_API = 'broker-api',
  CSV = 'csv',
  XML = 'xml',
}

export enum ImportItemStatus {
  MATCHED = 'matched',
  NEW = 'new',
  SKIPPED = 'skipped',
  ERROR = 'error',
}

// ===== DTO =====

export interface UserDto {
  id: string;
  email: string;
  name: string;
  baseCurrency: CurrencyCode;
  createdAt: string;
}

export interface AuthResponseDto {
  accessToken: string;
  refreshToken: string;
  user: UserDto;
}

export interface AccountDto {
  id: string;
  name: string;
  type: AccountType;
  currency: CurrencyCode;
  institution?: string;
  externalRef?: string;
}

export interface CreateAccountDto {
  name: string;
  type: AccountType;
  currency: CurrencyCode;
  institution?: string;
  externalRef?: string;
}

export interface UpdateAccountDto {
  name?: string;
  type?: AccountType;
  currency?: CurrencyCode;
  institution?: string;
  externalRef?: string;
}

export interface AssetDto {
  id: string;
  symbol: string;
  name: string;
  type: AssetType;
  currency: CurrencyCode;
  isin?: string;
  figi?: string;
}

export interface CreateAssetDto {
  symbol: string;
  name: string;
  type: AssetType;
  currency: CurrencyCode;
  isin?: string;
  figi?: string;
}

export interface AssetPriceDto extends AssetDto {
  currentPrice?: Money;
}

export interface TransactionDto {
  id: string;
  accountId: string;
  assetId?: string;
  type: TransactionType;
  date: string;
  quantity?: number;
  price?: Money;
  amount: Money;
  fee?: Money;
  tax?: Money;
  /** Реализованная прибыль продажи (FIFO, подзадача 2.3). Только для sell. */
  realizedPnl?: Money;
  source: ImportSourceType;
  sourceId?: string;
  note?: string;
}

export interface CreateTransactionDto {
  assetId?: string;
  type: TransactionType;
  date: string;
  quantity?: number;
  price?: Money;
  amount: Money;
  fee?: Money;
  tax?: Money;
  source?: ImportSourceType;
  sourceId?: string;
  note?: string;
}

export interface UpdateTransactionDto {
  assetId?: string;
  type?: TransactionType;
  date?: string;
  quantity?: number;
  price?: Money;
  amount?: Money;
  fee?: Money;
  tax?: Money;
  note?: string;
}

/** Позиция snapshot-ввода (режим A): актив, количество, средняя цена покупки. */
export interface OpeningItemDto {
  assetId: string;
  quantity: number;
  avgPrice: Money;
}

/** Запрос на snapshot-ввод: одна дата начала ведения + список позиций. */
export interface CreateOpeningDto {
  date: string;
  items: OpeningItemDto[];
}

export interface PositionDto {
  accountId: string;
  assetId: string;
  asset: AssetDto;
  quantity: number;
  avgCostBasis: Money;
  currentPrice?: Money;
  currentValue?: Money;
  unrealizedPnl?: Money;
  /** Сумма реализованной прибыли по sell-транзакциям актива (FIFO, подзадача 2.3). */
  realizedPnl?: Money;
  /** Изменение стоимости за день (с учётом доходов). */
  dayChange?: Money;
  /** Процент изменения за день от вчерашней стоимости. */
  dayChangePct?: number | null;
}

/** Партия (lot) — остаток покупки для cost basis по FIFO (подзадача 2.3). */
export interface LotDto {
  id: string;
  positionId: string;
  assetId: string;
  accountId: string;
  /** Остаток партии (дробное количество). */
  quantity: number;
  /** Cost basis за штуку в минимальных единицах. */
  costBasis: Money;
  /** Дата приобретения (дата buy/opening-транзакции). */
  acquiredAt: string;
  createdAt: string;
}

export interface PriceDto {
  assetId: string;
  date: string;
  price: Money;
  source: string;
}

export interface PortfolioAccountDto {
  account: AccountDto;
  /**
   * Агрегаты счёта.
   * С `?displayCurrency=` — корневые total* в валюте отображения; accounts[] всегда в валюте счёта.
   */
  totalValue: Money;
  totalCostBasis: Money;
  unrealizedPnl: Money;
  /** Сумма реализованной прибыли по sell-транзакциям счёта (FIFO, подзадача 2.3). */
  realizedPnl: Money;
  /** Изменение стоимости с начала сегодняшнего дня (разница currentValue − valueAt(startOfDay)). */
  dayChange: Money;
}

/** Итог портфеля в одной валюте (и одном scale minors). Без FX разные валюты не смешиваются. */
export interface PortfolioCurrencyTotalDto {
  totalValue: Money;
  totalCostBasis: Money;
  unrealizedPnl: Money;
  realizedPnl: Money;
  dayChange: Money;
  /** Scale минимальных единиц: 2 (брокер/кэш) или 6 (WALLET/крипта). */
  precision: number;
}

/** Валюты переключателя отображения (MVP). */
export type DisplayCurrencyCode = 'RUB' | 'USD' | 'EUR';

/** Доля портфеля по типу актива (рыночная стоимость). */
export interface PortfolioAllocationDto {
  type: AssetType;
  /** Σ currentValue позиций этого типа в валюте сводки. */
  value: Money;
  /** Доля от Σ allocation.value, 0…100; сумма сегментов = 100 (largest remainder, шаг 0.1). */
  weightPct: number;
}

export interface PortfolioDto {
  /**
   * Нативные итоги по `(currency, precision)` — без FX-смешения.
   * Для отладки и одно-валютного режима; UI дашборда при `displayCurrency` читает корневые total*.
   */
  totals: PortfolioCurrencyTotalDto[];
  /**
   * При `?displayCurrency=` — единая сводка в этой валюте (precision = displayPrecision).
   * Без параметра — совместимость: `totals[0]` или нули в RUB (не «весь портфель» при нескольких валютах).
   */
  totalValue: Money;
  totalCostBasis: Money;
  unrealizedPnl: Money;
  /** Сумма реализованной прибыли по всем счетам (FIFO, подзадача 2.3). */
  realizedPnl: Money;
  /** Изменение стоимости с начала сегодняшнего дня. */
  dayChange: Money;
  /** Запрошенная валюта отображения (если была в query). */
  displayCurrency?: DisplayCurrencyCode;
  /** Scale итогов в displayCurrency (всегда 2 для MVP). */
  displayPrecision?: number;
  /**
   * Разбивка по AssetType от currentValue (включая синтетический кэш).
   * При `displayCurrency` — в этой валюте; без параметра — только бакет `totals[0]`.
   * Нулевые типы и позиции без цены не входят; пустой портфель → [].
   */
  allocation: PortfolioAllocationDto[];
  accounts: PortfolioAccountDto[];
}

export interface IncomeEventDto {
  id: string;
  assetId: string;
  accountId: string;
  type: IncomeEventType;
  announcementDate?: string;
  exDate?: string;
  recordDate?: string;
  paymentDate: string;
  grossAmount: Money;
  taxWithheld?: Money;
  netAmount: Money;
  reinvested: boolean;
  transactionId?: string;
}

/** Запрос на создание income event (ADR-006). `netAmount` не передаётся — вычисляется на бэке: net = gross − taxWithheld. */
export interface CreateIncomeEventDto {
  accountId: string;
  assetId: string;
  type: IncomeEventType;
  announcementDate?: string;
  exDate?: string;
  recordDate?: string;
  paymentDate: string;
  grossAmount: Money;
  taxWithheld?: Money;
  reinvested: boolean;
  /** Цена реинвестирования (DRIP) — обязательна при `reinvested: true`. */
  reinvestPrice?: Money;
  /** Связать с существующей транзакцией книги вместо автоматического создания income-транзакции. */
  transactionId?: string;
  /**
   * Уже распределённый доход: только IncomeEvent (PnL / статистика), без `income`-транзакции в книге.
   * Кэш счёта не меняется. Несовместимо с `reinvested` и `transactionId`.
   */
  distributed?: boolean;
}

/** Агрегат по доходам: один элемент = группа (период/актив/валюта). */
export interface IncomeStatsItemDto {
  /** Ключ группы: период "YYYY-MM", id актива или код валюты для итогов. */
  key: string;
  count: number;
  gross: Money;
  taxWithheld: Money;
  net: Money;
  /** Доходность net / costBasis × 100 (2 знака). Только для byAsset/totals; null, если позиции нет. */
  yieldPct?: number | null;
}

/** Статистика доходов: итоги и разбивки по периодам и активам. */
export interface IncomeStatsDto {
  totals: IncomeStatsItemDto[];
  byPeriod: IncomeStatsItemDto[];
  byAsset: IncomeStatsItemDto[];
}

export interface ExpenseDto {
  id: string;
  categoryId: string;
  amount: Money;
  date: string;
  note?: string;
}

export interface ImportItemDto {
  id: string;
  raw: string;
  status: ImportItemStatus;
  error?: string;
  transaction?: TransactionDto;
}

export interface ImportBatchDto {
  id: string;
  sourceType: ImportSourceType;
  status: string;
  items: ImportItemDto[];
}

// ===== История стоимости (фаза 2, подзадача 2.4; ADR-008) =====

/** Шаг бакета истории стоимости. */
export enum HistoryInterval {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}

/**
 * Точность цены в точке истории (ADR-008):
 * - `current` — цена из PriceService (пока только «текущая»; в фазе 3 — на дату);
 * - `cost` — цена недоступна, использована себестоимость (AVCO) — плоский участок.
 */
export type HistoryPriceSource = 'current' | 'cost';

/** Точка истории стоимости на дату (конец бакета). Деньги — минимальные единицы (ADR-002). */
export interface PortfolioHistoryPointDto {
  /** Дата точки, YYYY-MM-DD (конец бакета). */
  date: string;
  /** Стоимость (позиции по текущим ценам + кэш). */
  value: Money;
  /** Вложено: себестоимость открытых позиций (AVCO на дату, без кэша). */
  invested: Money;
  /** Взносы на дату: Σ deposit + Σ opening − Σ withdrawal (как в составе). */
  contributions: Money;
  /** Денежный остаток счёта на дату. */
  cash: Money;
  /** Точность оценки цен в этой точке. */
  priceSource: HistoryPriceSource;
}

/** Доходность за период (календарный месяц в диапазоне). Modified Dietz. */
export interface HistoryPeriodDto {
  /** Ключ периода: `YYYY-MM`. */
  key: string;
  /** Начало периода (YYYY-MM-DD). */
  start: string;
  /** Конец периода (YYYY-MM-DD). */
  end: string;
  valueStart: Money;
  valueEnd: Money;
  /** Нетто-движение денег за период (вводы − выводы, по правилам кэша). */
  netFlow: Money;
  /** Рыночный результат периода: Δvalue − netFlow. */
  pnl: Money;
  /** Доходность за период, % (Modified Dietz, 2 знака); null — делить не на что. */
  returnPct: number | null;
}

/** История стоимости портфеля или счёта. */
export interface PortfolioHistoryDto {
  scope: 'portfolio' | 'account';
  currency: CurrencyCode;
  from: string;
  to: string;
  interval: HistoryInterval;
  points: PortfolioHistoryPointDto[];
  /** Доходность по месяцам внутри диапазона. */
  returns: HistoryPeriodDto[];
  /** Доходность за весь диапазон (Modified Dietz), %; null — делить не на что. */
  totalReturn: number | null;
}