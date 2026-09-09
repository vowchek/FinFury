import {
  AccountType,
  AssetDto,
  AssetType,
  CreateIncomeEventDto,
  CreateOpeningDto,
  IncomeEventType,
  OpeningItemDto,
} from '@finfury/contracts';
import { precisionForAccount, precisionForType, toMinorUnits } from './money';

/** Данные строки снапшота с опциональным доходом (UI → DTO). */
export interface OpeningRowDraft {
  asset: AssetDto | null;
  quantity: string;
  avgPrice: string;
  incomeType: IncomeEventType;
  incomeGross: string;
  incomeTax: string;
}

export const INCOME_TYPE_OPTIONS: { value: IncomeEventType; label: string }[] = [
  { value: IncomeEventType.DIVIDEND, label: 'Дивиденд' },
  { value: IncomeEventType.COUPON, label: 'Купон' },
  { value: IncomeEventType.INTEREST, label: 'Проценты' },
  { value: IncomeEventType.DISTRIBUTION, label: 'Распределение' },
];

/** Дефолтный тип дохода по классу актива. */
export function defaultIncomeType(assetType?: AssetType | null): IncomeEventType {
  switch (assetType) {
    case AssetType.BOND:
      return IncomeEventType.COUPON;
    case AssetType.FUND:
      return IncomeEventType.DISTRIBUTION;
    case AssetType.CASH:
    case AssetType.FX:
      return IncomeEventType.INTEREST;
    default:
      return IncomeEventType.DIVIDEND;
  }
}

export function isOpeningRowFilled(row: OpeningRowDraft): boolean {
  return Boolean(row.asset && row.quantity.trim() !== '' && row.avgPrice.trim() !== '');
}

/** Есть ли у строки заполненный gross (доход нужно создать после opening). */
export function rowHasIncome(row: OpeningRowDraft): boolean {
  return row.incomeGross.trim() !== '';
}

export function buildOpeningItems(
  rows: OpeningRowDraft[],
  accountType: AccountType,
): OpeningItemDto[] {
  return rows.filter(isOpeningRowFilled).map((r) => {
    const quoteCcy = r.asset!.currency;
    const prec = r.asset ? precisionForType(r.asset.type) : precisionForAccount(accountType);
    return {
      assetId: r.asset!.id,
      quantity: Number(r.quantity),
      avgPrice: {
        amount: toMinorUnits(r.avgPrice, prec),
        currency: quoteCcy,
      },
    };
  });
}

export function buildOpeningDto(
  date: string,
  rows: OpeningRowDraft[],
  accountType: AccountType,
): CreateOpeningDto {
  return { date, items: buildOpeningItems(rows, accountType) };
}

/**
 * DTO доходов для строк с заполненным gross.
 * Валюта — валюта счёта; paymentDate — дата начала ведения.
 * `distributed: true` — только в PnL/статистику, без зачисления в кэш.
 */
export function buildIncomeDtos(params: {
  rows: OpeningRowDraft[];
  accountId: string;
  currency: string;
  paymentDate: string;
}): CreateIncomeEventDto[] {
  const { rows, accountId, currency, paymentDate } = params;
  const result: CreateIncomeEventDto[] = [];

  for (const r of rows) {
    if (!isOpeningRowFilled(r) || !rowHasIncome(r) || !r.asset) continue;

    const prec = precisionForType(r.asset.type);
    const grossMinor = toMinorUnits(r.incomeGross, prec);
    if (grossMinor <= 0) continue;

    const dto: CreateIncomeEventDto = {
      accountId,
      assetId: r.asset.id,
      type: r.incomeType,
      paymentDate,
      grossAmount: { amount: grossMinor, currency },
      reinvested: false,
      distributed: true,
    };
    if (r.incomeTax.trim() !== '') {
      dto.taxWithheld = { amount: toMinorUnits(r.incomeTax, prec), currency };
    }
    result.push(dto);
  }

  return result;
}

/** Текст ошибки частичного сбоя: opening ок, часть income нет. */
export function partialIncomeErrorMessage(failedSymbols: string[]): string {
  const list = failedSymbols.length > 0 ? failedSymbols.join(', ') : 'части активов';
  return `Позиции сохранены, доход по ${list} не записан — добавьте через + Доход.`;
}
