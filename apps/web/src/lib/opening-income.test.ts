import { describe, expect, it } from 'vitest';
import { AccountType, AssetType, IncomeEventType } from '@finfury/contracts';
import {
  buildIncomeDtos,
  buildOpeningDto,
  defaultIncomeType,
  isOpeningRowFilled,
  partialIncomeErrorMessage,
  rowHasIncome,
  type OpeningRowDraft,
} from './opening-income';

function asset(partial: {
  id: string;
  type?: AssetType;
  currency?: string;
  symbol?: string;
}) {
  return {
    id: partial.id,
    symbol: partial.symbol ?? 'AAPL',
    name: 'Apple',
    type: partial.type ?? AssetType.STOCK,
    currency: partial.currency ?? 'USD',
  };
}

function row(partial: Partial<OpeningRowDraft> & Pick<OpeningRowDraft, 'asset'>): OpeningRowDraft {
  return {
    quantity: '10',
    avgPrice: '150.00',
    incomeType: IncomeEventType.DIVIDEND,
    incomeGross: '',
    incomeTax: '',
    ...partial,
  };
}

describe('defaultIncomeType', () => {
  it('выбирает тип по классу актива', () => {
    expect(defaultIncomeType(AssetType.STOCK)).toBe(IncomeEventType.DIVIDEND);
    expect(defaultIncomeType(AssetType.BOND)).toBe(IncomeEventType.COUPON);
    expect(defaultIncomeType(AssetType.FUND)).toBe(IncomeEventType.DISTRIBUTION);
    expect(defaultIncomeType(AssetType.CASH)).toBe(IncomeEventType.INTEREST);
    expect(defaultIncomeType(null)).toBe(IncomeEventType.DIVIDEND);
  });
});

describe('isOpeningRowFilled / rowHasIncome', () => {
  it('строка без актива или qty/цены — не заполнена', () => {
    expect(isOpeningRowFilled(row({ asset: null, quantity: '1', avgPrice: '1' }))).toBe(false);
    expect(isOpeningRowFilled(row({ asset: asset({ id: '1' }), quantity: '', avgPrice: '1' }))).toBe(
      false,
    );
  });

  it('пустой gross — дохода нет', () => {
    expect(rowHasIncome(row({ asset: asset({ id: '1' }), incomeGross: '' }))).toBe(false);
    expect(rowHasIncome(row({ asset: asset({ id: '1' }), incomeGross: '12.50' }))).toBe(true);
  });
});

describe('buildOpeningDto', () => {
  it('собирает только заполненные строки; avgPrice в валюте актива', () => {
    const dto = buildOpeningDto(
      '2024-01-15',
      [
        row({ asset: asset({ id: 'a1', currency: 'USD' }), quantity: '2', avgPrice: '10.00' }),
        row({ asset: null, quantity: '', avgPrice: '' }),
      ],
      AccountType.BROKER,
    );
    expect(dto.date).toBe('2024-01-15');
    expect(dto.items).toHaveLength(1);
    expect(dto.items[0]).toEqual({
      assetId: 'a1',
      quantity: 2,
      avgPrice: { amount: 1000, currency: 'USD' },
    });
  });
});

describe('buildIncomeDtos', () => {
  it('без gross — пустой список; с gross — DTO distributed (без кэша), валюта счёта', () => {
    const rows = [
      row({
        asset: asset({ id: 'a1', symbol: 'AAPL' }),
        incomeGross: '',
      }),
      row({
        asset: asset({ id: 'a2', symbol: 'SBER', currency: 'RUB', type: AssetType.STOCK }),
        incomeType: IncomeEventType.DIVIDEND,
        incomeGross: '100.00',
        incomeTax: '13.00',
      }),
    ];
    const dtos = buildIncomeDtos({
      rows,
      accountId: 'acc-1',
      currency: 'RUB',
      paymentDate: '2024-01-15',
    });
    expect(dtos).toHaveLength(1);
    expect(dtos[0]).toEqual({
      accountId: 'acc-1',
      assetId: 'a2',
      type: IncomeEventType.DIVIDEND,
      paymentDate: '2024-01-15',
      grossAmount: { amount: 10000, currency: 'RUB' },
      taxWithheld: { amount: 1300, currency: 'RUB' },
      reinvested: false,
      distributed: true,
    });
  });

  it('доход только у заполненных позиций; gross 0 пропускается', () => {
    const dtos = buildIncomeDtos({
      rows: [
        row({ asset: asset({ id: 'a1' }), incomeGross: '0' }),
        row({ asset: null, incomeGross: '50' }),
      ],
      accountId: 'acc-1',
      currency: 'USD',
      paymentDate: '2024-06-01',
    });
    expect(dtos).toHaveLength(0);
  });
});

describe('partialIncomeErrorMessage', () => {
  it('перечисляет тикеры', () => {
    expect(partialIncomeErrorMessage(['AAPL', 'SBER'])).toContain('AAPL, SBER');
    expect(partialIncomeErrorMessage(['AAPL'])).toContain('+ Доход');
  });
});
