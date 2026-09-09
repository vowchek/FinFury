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
  EXCHANGE = 'exchange',
  WALLET = 'wallet',
  CASH = 'cash',
  CARD = 'card',
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

export interface AssetDto {
  id: string;
  symbol: string;
  name: string;
  type: AssetType;
  currency: CurrencyCode;
  isin?: string;
  figi?: string;
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
  source: ImportSourceType;
  sourceId?: string;
  note?: string;
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
}

export interface PriceDto {
  assetId: string;
  date: string;
  price: Money;
  source: string;
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