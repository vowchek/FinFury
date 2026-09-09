import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AssetType, TransactionType } from '@finfury/contracts';
import { CASH_ASSET_ID } from './cash-balance';
import { PortfolioService } from './portfolio.service';

const ACCOUNT = {
  id: 'acc1',
  userId: 'u1',
  name: 'Брокер',
  type: 'brokerage',
  currency: 'RUB',
  institution: null,
  externalRef: null,
  createdAt: new Date('2026-01-01'),
};

const ASSET = {
  id: 'a1',
  symbol: 'GAZP',
  name: 'Газпром',
  type: AssetType.STOCK,
  currency: 'RUB',
  isin: null,
  figi: null,
};

const POSITION = {
  accountId: 'acc1',
  assetId: 'a1',
  quantity: '10',
  avgCostBasisAmount: 10000,
  avgCostBasisCurrency: 'RUB',
  currency: 'RUB',
};

function buildService(overrides: {
  account?: object | null;
  accounts?: object[];
  positions?: object[];
  assets?: object[];
  transactions?: object[];
  price?: { amount: number; currency: string } | 'throw';
} = {}) {
  const positions = {
    find: vi.fn(async () => overrides.positions ?? [POSITION]),
  };
  const assets = {
    find: vi.fn(async () => overrides.assets ?? [ASSET]),
  };
  const accounts = {
    findOne: vi.fn(async () =>
      overrides.account === undefined ? ACCOUNT : overrides.account,
    ),
    find: vi.fn(async () => overrides.accounts ?? [ACCOUNT]),
  };
  const transactions = {
    find: vi.fn(async () => overrides.transactions ?? []),
  };
  const prices = {
    getPrice: vi.fn(async () => {
      if (overrides.price === 'throw') throw new Error('no price');
      return overrides.price ?? { amount: 12000, currency: 'RUB' };
    }),
    getPriceWithPrevious: vi.fn(async () => {
      if (overrides.price === 'throw') throw new Error('no price');
      const p = overrides.price ?? { amount: 12000, currency: 'RUB' };
      return {
        current: p,
        previousClose: { amount: Math.round(p.amount * 0.92), currency: p.currency },
      };
    }),
    getFxRate: vi.fn(async (from: string, to: string) => {
      const f = from.toUpperCase();
      const t = to.toUpperCase();
      if (f === t) return { rate: 1, from: f, to: t, asOf: '2026-03-14', source: 'stub' };
      if (f === 'USD' && t === 'RUB') {
        return { rate: 100, from: f, to: t, asOf: '2026-03-14', source: 'stub' };
      }
      if (f === 'RUB' && t === 'USD') {
        return { rate: 0.01, from: f, to: t, asOf: '2026-03-14', source: 'stub' };
      }
      throw new Error(`no fx ${f}/${t}`);
    }),
  };
  const service = new PortfolioService(
    positions as never,
    assets as never,
    accounts as never,
    transactions as never,
    prices as never,
  );
  return { service, positions, assets, accounts, transactions, prices };
}

describe('PortfolioService.getAccountPositions', () => {
  it('обогащает позиции ценой, unrealized и realized PnL', async () => {
    const { service, prices } = buildService({
      transactions: [
        {
          accountId: 'acc1',
          assetId: 'a1',
          type: TransactionType.SELL,
          amountAmount: 0,
          feeAmount: null,
          taxAmount: null,
          realizedPnlAmount: 5000,
        },
      ],
    });

    const rows = await service.getAccountPositions('u1', 'acc1');

    expect(prices.getPriceWithPrevious).toHaveBeenCalledWith('GAZP', AssetType.STOCK, undefined);
    // sell двигает кэш → синтетическая строка в конце
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      accountId: 'acc1',
      assetId: 'a1',
      quantity: 10,
      avgCostBasis: { amount: 10000, currency: 'RUB' },
      currentPrice: { amount: 12000, currency: 'RUB' },
      currentValue: { amount: 120000, currency: 'RUB' },
      unrealizedPnl: { amount: 20000, currency: 'RUB' },
      realizedPnl: { amount: 5000, currency: 'RUB' },
    });
    expect(rows[0].asset.symbol).toBe('GAZP');
    expect(rows[1].assetId).toBe(CASH_ASSET_ID);
    expect(rows[1].currentValue).toEqual({ amount: 0, currency: 'RUB' });
  });

  it('иностранная акция: currentPrice в USD, currentValue в RUB через FX', async () => {
    const { service, prices } = buildService({
      assets: [
        {
          id: 'a1',
          symbol: 'AAPL',
          name: 'Apple',
          type: AssetType.STOCK,
          currency: 'USD',
          isin: null,
          figi: null,
        },
      ],
      positions: [
        {
          accountId: 'acc1',
          assetId: 'a1',
          quantity: '1',
          avgCostBasisAmount: 2_500_000, // уже в RUB после записи сделки
          avgCostBasisCurrency: 'RUB',
          currency: 'RUB',
        },
      ],
      price: { amount: 30_000, currency: 'USD' }, // $300.00
    });

    const rows = await service.getAccountPositions('u1', 'acc1');

    expect(prices.getFxRate).toHaveBeenCalledWith('USD', 'RUB');
    expect(rows[0].currentPrice).toEqual({ amount: 30_000, currency: 'USD' });
    // $300 × rate 100 = 30_000.00 RUB
    expect(rows[0].currentValue).toEqual({ amount: 3_000_000, currency: 'RUB' });
    expect(rows[0].unrealizedPnl).toEqual({ amount: 500_000, currency: 'RUB' });
  });

  it('добавляет кэш из deposit/income в конец', async () => {
    const { service } = buildService({
      transactions: [
        {
          type: TransactionType.DEPOSIT,
          amountAmount: 100_000,
          feeAmount: null,
          taxAmount: null,
          realizedPnlAmount: null,
        },
        {
          type: TransactionType.INCOME,
          amountAmount: 5_000,
          feeAmount: null,
          taxAmount: null,
          realizedPnlAmount: null,
        },
      ],
    });

    const rows = await service.getAccountPositions('u1', 'acc1');
    const cash = rows[rows.length - 1];
    expect(cash.assetId).toBe(CASH_ASSET_ID);
    expect(cash.asset.name).toBe('Кэш');
    expect(cash.currentValue).toEqual({ amount: 105_000, currency: 'RUB' });
    expect(cash.unrealizedPnl).toEqual({ amount: 0, currency: 'RUB' });
  });

  it('без денежных tx не добавляет строку кэша', async () => {
    const { service } = buildService({
      transactions: [
        {
          type: TransactionType.OPENING,
          amountAmount: 50_000,
          feeAmount: null,
          taxAmount: null,
          realizedPnlAmount: null,
        },
      ],
    });
    const rows = await service.getAccountPositions('u1', 'acc1');
    expect(rows).toHaveLength(1);
    expect(rows[0].assetId).toBe('a1');
  });

  it('чужой счёт → 404', async () => {
    const { service } = buildService({ account: null });
    await expect(service.getAccountPositions('u1', 'acc-x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('без цены возвращает позицию без оценки', async () => {
    const { service } = buildService({ price: 'throw' });

    const rows = await service.getAccountPositions('u1', 'acc1');

    expect(rows[0].currentPrice).toBeUndefined();
    expect(rows[0].currentValue).toBeUndefined();
    expect(rows[0].unrealizedPnl).toBeUndefined();
  });

  it('пропускает позицию, если актив удалён из справочника', async () => {
    const { service } = buildService({ assets: [] });
    const rows = await service.getAccountPositions('u1', 'acc1');
    expect(rows).toEqual([]);
  });
});

describe('PortfolioService.getPortfolio', () => {
  it('суммирует value/cost/unrealized/realized по счетам (кэш в value и cost)', async () => {
    const { service } = buildService({
      transactions: [
        {
          accountId: 'acc1',
          assetId: 'a1',
          type: TransactionType.SELL,
          amountAmount: 0,
          feeAmount: null,
          taxAmount: null,
          realizedPnlAmount: 3000,
        },
        {
          accountId: 'acc1',
          type: TransactionType.DEPOSIT,
          amountAmount: 10_000,
          feeAmount: null,
          taxAmount: null,
          realizedPnlAmount: null,
        },
      ],
    });

    const portfolio = await service.getPortfolio('u1');

    // бумаги 120000 + кэш 10000 (sell 0 + deposit)
    expect(portfolio.totalValue).toEqual({ amount: 130000, currency: 'RUB' });
    // cost бумаг 100000 + кэш at par 10000
    expect(portfolio.totalCostBasis).toEqual({ amount: 110000, currency: 'RUB' });
    expect(portfolio.unrealizedPnl).toEqual({ amount: 20000, currency: 'RUB' });
    expect(portfolio.realizedPnl).toEqual({ amount: 3000, currency: 'RUB' });
    expect(portfolio.totals).toEqual([
      {
        totalValue: { amount: 130000, currency: 'RUB' },
        totalCostBasis: { amount: 110000, currency: 'RUB' },
        unrealizedPnl: { amount: 20000, currency: 'RUB' },
        realizedPnl: { amount: 3000, currency: 'RUB' },
        dayChange: portfolio.dayChange,
        precision: 2,
      },
    ]);
    expect(portfolio.accounts).toHaveLength(1);
    expect(portfolio.accounts[0].account.name).toBe('Брокер');
    expect(portfolio.accounts[0].realizedPnl).toEqual({ amount: 3000, currency: 'RUB' });
  });

  it('пустой портфель — нули в RUB', async () => {
    const { service } = buildService({ accounts: [], positions: [] });

    const portfolio = await service.getPortfolio('u1');

    expect(portfolio).toEqual({
      totals: [],
      totalValue: { amount: 0, currency: 'RUB' },
      totalCostBasis: { amount: 0, currency: 'RUB' },
      unrealizedPnl: { amount: 0, currency: 'RUB' },
      realizedPnl: { amount: 0, currency: 'RUB' },
      dayChange: { amount: 0, currency: 'RUB' },
      allocation: [],
      accounts: [],
    });
  });

  it('allocation: STOCK + BOND + CASH → веса; кэш в cash', async () => {
    const bond = {
      id: 'a-bond',
      symbol: 'OFZ',
      name: 'ОФЗ',
      type: AssetType.BOND,
      currency: 'RUB',
      isin: null,
      figi: null,
    };
    const { service } = buildService({
      assets: [ASSET, bond],
      positions: [
        {
          accountId: 'acc1',
          assetId: 'a1',
          quantity: '10',
          avgCostBasisAmount: 10000,
          avgCostBasisCurrency: 'RUB',
          currency: 'RUB',
        },
        {
          accountId: 'acc1',
          assetId: 'a-bond',
          quantity: '5',
          avgCostBasisAmount: 8000,
          avgCostBasisCurrency: 'RUB',
          currency: 'RUB',
        },
      ],
      transactions: [
        {
          accountId: 'acc1',
          type: TransactionType.DEPOSIT,
          amountAmount: 30_000,
          feeAmount: null,
          taxAmount: null,
          realizedPnlAmount: null,
        },
      ],
      // getPriceWithPrevious вызывается per-asset; stub возвращает одну цену для всех
      price: { amount: 10000, currency: 'RUB' },
    });

    const portfolio = await service.getPortfolio('u1');
    // stock: 10×10000=100000; bond: 5×10000=50000; cash: 30000 → total 180000
    expect(portfolio.allocation).toEqual([
      { type: AssetType.STOCK, value: { amount: 100_000, currency: 'RUB' }, weightPct: 55.5 },
      { type: AssetType.BOND, value: { amount: 50_000, currency: 'RUB' }, weightPct: 27.8 },
      { type: AssetType.CASH, value: { amount: 30_000, currency: 'RUB' }, weightPct: 16.7 },
    ]);
    expect(portfolio.allocation.reduce((s, a) => s + a.weightPct, 0)).toBeCloseTo(100, 5);
  });

  it('allocation: только CRYPTO', async () => {
    const wallet = {
      id: 'acc-w',
      userId: 'u1',
      name: 'Крипто',
      type: 'wallet',
      currency: 'USD',
      institution: null,
      externalRef: null,
      createdAt: new Date('2026-01-01'),
    };
    const btc = {
      id: 'btc',
      symbol: 'bitcoin',
      name: 'Bitcoin',
      type: AssetType.CRYPTO,
      currency: 'USD',
      isin: null,
      figi: null,
    };
    const { service } = buildService({
      accounts: [wallet],
      assets: [btc],
      positions: [
        {
          accountId: 'acc-w',
          assetId: 'btc',
          quantity: '1',
          avgCostBasisAmount: 50_000_000_000, // 50k @ p6
          avgCostBasisCurrency: 'USD',
          currency: 'USD',
        },
      ],
      price: { amount: 60_000_000_000, currency: 'USD' },
    });

    const portfolio = await service.getPortfolio('u1');
    expect(portfolio.allocation).toEqual([
      {
        type: AssetType.CRYPTO,
        value: { amount: 60_000_000_000, currency: 'USD' },
        weightPct: 100,
      },
    ]);
  });

  it('allocation: позиции без цены игнорируются', async () => {
    const { service } = buildService({ price: 'throw' });
    const portfolio = await service.getPortfolio('u1');
    expect(portfolio.allocation).toEqual([]);
  });

  it('allocation: displayCurrency — суммы в целевой валюте', async () => {
    const rubAccount = {
      id: 'acc-rub',
      userId: 'u1',
      name: 'Брокер',
      type: 'broker',
      currency: 'RUB',
      institution: null,
      externalRef: null,
      createdAt: new Date('2026-01-01'),
    };
    const usdAccount = {
      id: 'acc-usd',
      userId: 'u1',
      name: 'Крипто',
      type: 'wallet',
      currency: 'USD',
      institution: null,
      externalRef: null,
      createdAt: new Date('2026-01-02'),
    };
    const { service } = buildService({
      accounts: [rubAccount, usdAccount],
      positions: [
        {
          accountId: 'acc-rub',
          assetId: 'a1',
          quantity: '10',
          avgCostBasisAmount: 10000,
          avgCostBasisCurrency: 'RUB',
          currency: 'RUB',
        },
      ],
      transactions: [
        {
          accountId: 'acc-usd',
          type: TransactionType.DEPOSIT,
          amountAmount: 10_000_000_000, // 10_000.00 @ p6
          feeAmount: null,
          taxAmount: null,
          realizedPnlAmount: null,
        },
      ],
    });

    const portfolio = await service.getPortfolio('u1', 'RUB');
    // stock 120_000 RUB + cash 10_000 USD × 100 = 100_000_000 RUB
    expect(portfolio.allocation).toEqual([
      { type: AssetType.STOCK, value: { amount: 120_000, currency: 'RUB' }, weightPct: 0.1 },
      { type: AssetType.CASH, value: { amount: 100_000_000, currency: 'RUB' }, weightPct: 99.9 },
    ]);
    expect(portfolio.allocation.reduce((s, a) => s + a.weightPct, 0)).toBeCloseTo(100, 5);
  });

  it('allocation: пустой при нулевых стоимостях', async () => {
    const { service } = buildService({
      transactions: [
        {
          accountId: 'acc1',
          assetId: 'a1',
          type: TransactionType.SELL,
          amountAmount: 0,
          feeAmount: null,
          taxAmount: null,
          realizedPnlAmount: 0,
        },
      ],
      price: 'throw',
    });
    const portfolio = await service.getPortfolio('u1');
    // бумага без цены; кэш sell(0) = 0 → не входит
    expect(portfolio.allocation).toEqual([]);
  });

  it('не смешивает разные валюты в один totalValue', async () => {
    const rubAccount = {
      id: 'acc-rub',
      userId: 'u1',
      name: 'Брокер',
      type: 'broker',
      currency: 'RUB',
      institution: null,
      externalRef: null,
      createdAt: new Date('2026-01-01'),
    };
    const usdAccount = {
      id: 'acc-usd',
      userId: 'u1',
      name: 'Крипто',
      type: 'wallet',
      currency: 'USD',
      institution: null,
      externalRef: null,
      createdAt: new Date('2026-01-02'),
    };
    const { service } = buildService({
      accounts: [rubAccount, usdAccount],
      positions: [
        {
          accountId: 'acc-rub',
          assetId: 'a1',
          quantity: '10',
          avgCostBasisAmount: 10000,
          avgCostBasisCurrency: 'RUB',
          currency: 'RUB',
        },
      ],
      transactions: [
        {
          accountId: 'acc-usd',
          type: TransactionType.DEPOSIT,
          amountAmount: 10_000_000_000, // 10_000.00 при precision 6
          feeAmount: null,
          taxAmount: null,
          realizedPnlAmount: null,
        },
      ],
    });

    const portfolio = await service.getPortfolio('u1');

    expect(portfolio.totals).toHaveLength(2);
    expect(portfolio.totals[0]).toMatchObject({
      totalValue: { currency: 'RUB' },
      precision: 2,
    });
    expect(portfolio.totals[1]).toMatchObject({
      totalValue: { amount: 10_000_000_000, currency: 'USD' },
      precision: 6,
    });
    // legacy totalValue — только первая валюта (RUB), без «прилипших» USD minors
    expect(portfolio.totalValue.currency).toBe('RUB');
    expect(portfolio.totalValue.amount).toBe(120_000);
  });

  it('dayChange = currentValue − yesterdayValue − buyCostToday + sellProceedsToday', async () => {
    const { service } = buildService({
      transactions: [
        {
          accountId: 'acc1',
          assetId: 'a1',
          type: TransactionType.BUY,
          date: new Date().toISOString().slice(0, 10), // today
          amountAmount: 200_000, // 10 × 20000
          quantity: 10,
          priceAmount: 20000,
          feeAmount: null,
          taxAmount: null,
          realizedPnlAmount: null,
        },
      ],
      price: { amount: 25000, currency: 'RUB' }, // current price 250
    });

    const portfolio = await service.getPortfolio('u1');

    // currentValue = 10 × 25000 = 250000
    // yesterdayValue = 0 (нет позиции вчера)
    // buyCostToday = 200000 (10 × 20000)
    // dayChange = 250000 − 0 − 200000 = 50000
    expect(portfolio.accounts[0].dayChange).toEqual({ amount: 50000, currency: 'RUB' });
  });

  it('displayCurrency=RUB сводит RUB+USD wallet без прилипания minors', async () => {
    const rubAccount = {
      id: 'acc-rub',
      userId: 'u1',
      name: 'Брокер',
      type: 'broker',
      currency: 'RUB',
      institution: null,
      externalRef: null,
      createdAt: new Date('2026-01-01'),
    };
    const usdAccount = {
      id: 'acc-usd',
      userId: 'u1',
      name: 'Крипто',
      type: 'wallet',
      currency: 'USD',
      institution: null,
      externalRef: null,
      createdAt: new Date('2026-01-02'),
    };
    const { service, prices } = buildService({
      accounts: [rubAccount, usdAccount],
      positions: [
        {
          accountId: 'acc-rub',
          assetId: 'a1',
          quantity: '10',
          avgCostBasisAmount: 10000,
          avgCostBasisCurrency: 'RUB',
          currency: 'RUB',
        },
      ],
      transactions: [
        {
          accountId: 'acc-usd',
          type: TransactionType.DEPOSIT,
          amountAmount: 10_000_000_000, // 10_000.00 @ p6
          feeAmount: null,
          taxAmount: null,
          realizedPnlAmount: null,
        },
      ],
    });

    const portfolio = await service.getPortfolio('u1', 'RUB');

    // бумаги 1200.00 RUB + кэш 10_000 USD × 100 = 1_000_000 RUB
    // = 120_000 + 100_000_000 = 100_120_000 kopecks
    expect(portfolio.displayCurrency).toBe('RUB');
    expect(portfolio.displayPrecision).toBe(2);
    expect(portfolio.totalValue).toEqual({ amount: 100_120_000, currency: 'RUB' });
    // accounts[] остаются в валюте счёта (не display)
    expect(portfolio.accounts[1].totalValue).toEqual({
      amount: 10_000_000_000,
      currency: 'USD',
    });
    expect(portfolio.totals).toHaveLength(2);
    expect(prices.getFxRate).toHaveBeenCalled();
  });

  it('displayCurrency=USD: одно-валютный RUB портфель конвертируется', async () => {
    const { service } = buildService();
    const portfolio = await service.getPortfolio('u1', 'USD');
    // 1200.00 RUB × 0.01 = 12.00 USD = 1200 cents
    expect(portfolio.totalValue).toEqual({ amount: 1200, currency: 'USD' });
    // счёт остаётся в RUB
    expect(portfolio.accounts[0].totalValue.currency).toBe('RUB');
  });

  it('невалидный displayCurrency → 400', async () => {
    const { service } = buildService();
    const { BadRequestException } = await import('@nestjs/common');
    await expect(service.getPortfolio('u1', 'GBP')).rejects.toBeInstanceOf(BadRequestException);
  });
});
