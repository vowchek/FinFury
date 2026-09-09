import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  AccountDto,
  AssetDto,
  AssetType,
  DisplayCurrencyCode,
  Money,
  PortfolioAccountDto,
  PortfolioAllocationDto,
  PortfolioCurrencyTotalDto,
  PortfolioDto,
  PositionDto,
  TransactionType,
} from '@finfury/contracts';
import { In, Repository } from 'typeorm';
import {
  convertMoney,
  isDisplayCurrency,
  precisionForAccountType,
  precisionForAssetType,
  precisionForDisplayCurrency,
} from '../../common/fx-convert';
import { PriceService } from '../../prices/price.service';
import { toIsoDate, ResolvedPrice } from '../history/history-calculator';
import { Account } from '../accounts/account.entity';
import { Asset } from '../assets/asset.entity';
import { Transaction } from '../transactions/transaction.entity';
import {
  CASH_ASSET_ID,
  calculateCashBalance,
  hasCashAffectingTransactions,
  type CashTransactionInput,
} from './cash-balance';
import { Position } from './position.entity';
import { valuePosition } from './position-valuation';

/** Стабильный порядок сегментов allocation (как на лендинге + fund/fx). */
const ALLOCATION_TYPE_ORDER: AssetType[] = [
  AssetType.STOCK,
  AssetType.BOND,
  AssetType.FUND,
  AssetType.CRYPTO,
  AssetType.CASH,
  AssetType.FX,
];

/**
 * Доли 0…100 с суммой ровно 100 (largest remainder на десятых долях %).
 * При total ≤ 0 — нули.
 */
export function allocationWeightPercents(amounts: number[]): number[] {
  const total = amounts.reduce((s, a) => s + a, 0);
  if (total <= 0 || amounts.length === 0) return amounts.map(() => 0);

  // Работаем в десятых долях процента (1000 = 100.0%).
  const exactTenths = amounts.map((a) => (a / total) * 1000);
  const floors = exactTenths.map((v) => Math.floor(v));
  let rem = 1000 - floors.reduce((s, v) => s + v, 0);
  const byFrac = exactTenths
    .map((v, i) => ({ i, frac: v - floors[i] }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  const result = [...floors];
  for (let k = 0; k < rem; k++) {
    result[byFrac[k]!.i] += 1;
  }
  return result.map((t) => t / 10);
}

function finalizeAllocation(
  sums: Map<AssetType, number>,
  currency: string,
): PortfolioAllocationDto[] {
  const entries = ALLOCATION_TYPE_ORDER.filter((t) => (sums.get(t) ?? 0) > 0).map((type) => ({
    type,
    amount: sums.get(type)!,
  }));
  if (entries.length === 0) return [];

  const weights = allocationWeightPercents(entries.map((e) => e.amount));
  return entries.map((e, i) => ({
    type: e.type,
    value: { amount: e.amount, currency },
    weightPct: weights[i]!,
  }));
}

/**
 * Чтение позиций и оценка портфеля (TASK-6).
 * Позиции — производный кэш (ADR-003); оценка идёт через PriceService (ADR-005).
 * FX-сводка — ADR-009 (`?displayCurrency=`).
 * В конец списка добавляется синтетическая позиция «Кэш» из книги.
 * Все суммы — целые минимальные единицы (ADR-002).
 */
@Injectable()
export class PortfolioService {
  constructor(
    @InjectRepository(Position)
    private readonly positions: Repository<Position>,
    @InjectRepository(Asset)
    private readonly assets: Repository<Asset>,
    @InjectRepository(Account)
    private readonly accounts: Repository<Account>,
    @InjectRepository(Transaction)
    private readonly transactions: Repository<Transaction>,
    private readonly prices: PriceService,
  ) {}

  private async findAccount(userId: string, accountId: string): Promise<Account> {
    const account = await this.accounts.findOne({ where: { id: accountId, userId } });
    if (!account) throw new NotFoundException('Счёт не найден');
    return account;
  }

  private toAssetDto(asset: Asset): AssetDto {
    return {
      id: asset.id,
      symbol: asset.symbol,
      name: asset.name,
      type: asset.type,
      currency: asset.currency,
      isin: asset.isin ?? undefined,
      figi: asset.figi ?? undefined,
    };
  }

  private toAccountDto(account: Account): AccountDto {
    return {
      id: account.id,
      name: account.name,
      type: account.type,
      currency: account.currency,
      institution: account.institution ?? undefined,
      externalRef: account.externalRef ?? undefined,
    };
  }

  /** Позиции счёта с текущей стоимостью и unrealized PnL (+ кэш в конце). */
  async getAccountPositions(userId: string, accountId: string): Promise<PositionDto[]> {
    const account = await this.findAccount(userId, accountId);
    const rows = await this.positions.find({ where: { accountId } });
    const txs = await this.transactions.find({ where: { accountId } });
    const assetIds = [...new Set(rows.map((r) => r.assetId))];
    const assets =
      assetIds.length > 0 ? await this.assets.find({ where: { id: In(assetIds) } }) : [];
    const { currentPriceOf, yesterdayPriceOf } = await this.buildPriceResolvers(assets);
    const enriched = await this.enrich(
      rows,
      txs,
      yesterdayPriceOf,
      currentPriceOf,
      precisionForAccountType(account.type),
    );
    return this.appendCash(account, enriched, txs);
  }

  /**
   * Сводка по всем счетам пользователя.
   * @param displayCurrency — если задана, корневые total* и accounts[] в этой валюте (ADR-009).
   */
  async getPortfolio(userId: string, displayCurrency?: string): Promise<PortfolioDto> {
    let display: DisplayCurrencyCode | undefined;
    if (displayCurrency !== undefined && displayCurrency !== '') {
      const code = displayCurrency.toUpperCase();
      if (!isDisplayCurrency(code)) {
        throw new BadRequestException(
          `displayCurrency должна быть одной из: RUB, USD, EUR (получено: ${displayCurrency})`,
        );
      }
      display = code;
    }

    const accounts = await this.accounts.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });

    const accountSummaries: PortfolioAccountDto[] = [];
    // Ключ: currency + precision — нельзя складывать RUB×100 с USD×1e6.
    const buckets = new Map<
      string,
      {
        currency: string;
        precision: number;
        value: number;
        cost: number;
        pnl: number;
        realized: number;
        dayChange: number;
      }
    >();
    /** Нативные суммы currentValue по типу внутри счёта (для allocation). */
    const allocByAccount = new Map<string, Map<AssetType, number>>();

    const accountIds = accounts.map((a) => a.id);
    const allRows =
      accountIds.length > 0
        ? await this.positions.find({ where: { accountId: In(accountIds) } })
        : [];
    const allTxs =
      accountIds.length > 0
        ? await this.transactions.find({ where: { accountId: In(accountIds) } })
        : [];
    const assetIds = [...new Set(allRows.map((r) => r.assetId))];
    const assets =
      assetIds.length > 0 ? await this.assets.find({ where: { id: In(assetIds) } }) : [];
    const { currentPriceOf, yesterdayPriceOf } = await this.buildPriceResolvers(assets);

    const rowsByAccount = new Map<string, Position[]>();
    for (const row of allRows) {
      const list = rowsByAccount.get(row.accountId) ?? [];
      list.push(row);
      rowsByAccount.set(row.accountId, list);
    }
    const txsByAccount = new Map<string, Transaction[]>();
    for (const tx of allTxs) {
      const list = txsByAccount.get(tx.accountId) ?? [];
      list.push(tx);
      txsByAccount.set(tx.accountId, list);
    }

    for (const account of accounts) {
      const rows = rowsByAccount.get(account.id) ?? [];
      const txs = txsByAccount.get(account.id) ?? [];
      const enriched = await this.appendCash(
        account,
        await this.enrich(
          rows,
          txs,
          yesterdayPriceOf,
          currentPriceOf,
          precisionForAccountType(account.type),
        ),
        txs,
      );

      let value = 0;
      let cost = 0;
      let pnl = 0;
      let realized = 0;
      let dayChangeSum = 0;
      const typeSums = new Map<AssetType, number>();
      for (const p of enriched) {
        if (p.currentValue) {
          value += p.currentValue.amount;
          if (p.currentValue.amount > 0) {
            typeSums.set(
              p.asset.type,
              (typeSums.get(p.asset.type) ?? 0) + p.currentValue.amount,
            );
          }
        }
        cost += Math.round(p.quantity * p.avgCostBasis.amount);
        if (p.unrealizedPnl) pnl += p.unrealizedPnl.amount;
        if (p.realizedPnl) realized += p.realizedPnl.amount;
        if (p.dayChange) dayChangeSum += p.dayChange.amount;
      }
      allocByAccount.set(account.id, typeSums);

      accountSummaries.push({
        account: this.toAccountDto(account),
        totalValue: { amount: value, currency: account.currency },
        totalCostBasis: { amount: cost, currency: account.currency },
        unrealizedPnl: { amount: pnl, currency: account.currency },
        realizedPnl: { amount: realized, currency: account.currency },
        dayChange: { amount: dayChangeSum, currency: account.currency },
      });

      const precision = precisionForAccountType(account.type);
      const key = `${account.currency}:${precision}`;
      const bucket = buckets.get(key) ?? {
        currency: account.currency,
        precision,
        value: 0,
        cost: 0,
        pnl: 0,
        realized: 0,
        dayChange: 0,
      };
      bucket.value += value;
      bucket.cost += cost;
      bucket.pnl += pnl;
      bucket.realized += realized;
      bucket.dayChange += dayChangeSum;
      buckets.set(key, bucket);
    }

    const totals: PortfolioCurrencyTotalDto[] = [...buckets.values()].map((b) => ({
      totalValue: { amount: b.value, currency: b.currency },
      totalCostBasis: { amount: b.cost, currency: b.currency },
      unrealizedPnl: { amount: b.pnl, currency: b.currency },
      realizedPnl: { amount: b.realized, currency: b.currency },
      dayChange: { amount: b.dayChange, currency: b.currency },
      precision: b.precision,
    }));

    const primary = totals[0] ?? {
      totalValue: { amount: 0, currency: 'RUB' },
      totalCostBasis: { amount: 0, currency: 'RUB' },
      unrealizedPnl: { amount: 0, currency: 'RUB' },
      realizedPnl: { amount: 0, currency: 'RUB' },
      dayChange: { amount: 0, currency: 'RUB' },
      precision: 2,
    };

    if (!display) {
      const primaryKey = totals[0]
        ? `${totals[0].totalValue.currency}:${totals[0].precision}`
        : null;
      const nativeSums = new Map<AssetType, number>();
      if (primaryKey) {
        for (const account of accounts) {
          const key = `${account.currency}:${precisionForAccountType(account.type)}`;
          if (key !== primaryKey) continue;
          const byType = allocByAccount.get(account.id);
          if (!byType) continue;
          for (const [type, amount] of byType) {
            nativeSums.set(type, (nativeSums.get(type) ?? 0) + amount);
          }
        }
      }
      return {
        totals,
        totalValue: primary.totalValue,
        totalCostBasis: primary.totalCostBasis,
        unrealizedPnl: primary.unrealizedPnl,
        realizedPnl: primary.realizedPnl,
        dayChange: primary.dayChange,
        allocation: finalizeAllocation(nativeSums, primary.totalValue.currency),
        accounts: accountSummaries,
      };
    }

    return this.toDisplayCurrency(display, totals, accountSummaries, accounts, allocByAccount);
  }

  /** Пересчёт корневых total* в display-валюту; accounts[] остаются в валюте счёта. */
  private async toDisplayCurrency(
    display: DisplayCurrencyCode,
    totals: PortfolioCurrencyTotalDto[],
    accountSummaries: PortfolioAccountDto[],
    accounts: Account[],
    allocByAccount: Map<string, Map<AssetType, number>>,
  ): Promise<PortfolioDto> {
    const toPrec = precisionForDisplayCurrency(display);
    const accountById = new Map(accounts.map((a) => [a.id, a]));

    const rateCache = new Map<string, number>();
    const rateFor = async (from: string): Promise<number> => {
      const key = from.toUpperCase();
      const hit = rateCache.get(key);
      if (hit !== undefined) return hit;
      const fx = await this.prices.getFxRate(from, display);
      rateCache.set(key, fx.rate);
      return fx.rate;
    };

    let value = 0;
    let cost = 0;
    let pnl = 0;
    let realized = 0;
    let dayChange = 0;
    const allocationSums = new Map<AssetType, number>();

    for (const summary of accountSummaries) {
      const acc = accountById.get(summary.account.id);
      const fromPrec = precisionForAccountType(acc?.type ?? summary.account.type);
      const rate = await rateFor(summary.totalValue.currency);
      value += convertMoney(summary.totalValue.amount, fromPrec, toPrec, rate);
      cost += convertMoney(summary.totalCostBasis.amount, fromPrec, toPrec, rate);
      pnl += convertMoney(summary.unrealizedPnl.amount, fromPrec, toPrec, rate);
      realized += convertMoney(summary.realizedPnl.amount, fromPrec, toPrec, rate);
      dayChange += convertMoney(summary.dayChange.amount, fromPrec, toPrec, rate);

      const byType = allocByAccount.get(summary.account.id);
      if (byType) {
        for (const [type, amount] of byType) {
          const converted = convertMoney(amount, fromPrec, toPrec, rate);
          if (converted > 0) {
            allocationSums.set(type, (allocationSums.get(type) ?? 0) + converted);
          }
        }
      }
    }

    return {
      totals,
      totalValue: { amount: value, currency: display },
      totalCostBasis: { amount: cost, currency: display },
      unrealizedPnl: { amount: pnl, currency: display },
      realizedPnl: { amount: realized, currency: display },
      dayChange: { amount: dayChange, currency: display },
      displayCurrency: display,
      displayPrecision: toPrec,
      allocation: finalizeAllocation(allocationSums, display),
      // Дашборд accounts.list — в валюте счёта; FX только в portfolio.status
      accounts: accountSummaries,
    };
  }

  /** Обогащает позиции активами, текущей ценой и оценкой. */
  private async enrich(
    rows: Position[],
    txs: Transaction[],
    yesterdayPriceOf: ((assetId: string) => ResolvedPrice | undefined) | undefined,
    currentPriceOf: ((assetId: string) => Money | undefined) | undefined,
    accountPrec: number,
  ): Promise<PositionDto[]> {
    if (rows.length === 0) return [];

    const assetIds = rows.map((r) => r.assetId);
    const assets = await this.assets.find({ where: { id: In(assetIds) } });
    const assetMap = new Map(assets.map((a) => [a.id, a]));

    const realizedByAsset = new Map<string, number>();
    for (const s of txs) {
      if (s.type === TransactionType.SELL && s.assetId && s.realizedPnlAmount !== null) {
        realizedByAsset.set(s.assetId, (realizedByAsset.get(s.assetId) ?? 0) + s.realizedPnlAmount);
      }
    }

    const today = toIsoDate(Date.now());

    const qtyYesterday = new Map<string, number>();
    for (const row of rows) {
      qtyYesterday.set(row.assetId, Number(row.quantity));
    }
    for (const t of txs) {
      if (t.date === today && t.assetId && t.quantity !== null) {
        const prev = qtyYesterday.get(t.assetId) ?? 0;
        if (t.type === TransactionType.BUY || t.type === TransactionType.OPENING) {
          qtyYesterday.set(t.assetId, prev - Number(t.quantity));
        } else if (t.type === TransactionType.SELL) {
          qtyYesterday.set(t.assetId, prev + Number(t.quantity));
        }
      }
    }

    // FX quote→account (иностранная акция USD на RUB-счёте)
    const fxCache = new Map<string, number>();
    const quoteToAccount = async (
      quote: Money,
      accountCurrency: string,
      assetType: string,
    ): Promise<number> => {
      const from = quote.currency.toUpperCase();
      const to = accountCurrency.toUpperCase();
      if (from === to) return quote.amount;
      const key = `${from}:${to}`;
      let rate = fxCache.get(key);
      if (rate === undefined) {
        rate = (await this.prices.getFxRate(from, to)).rate;
        fxCache.set(key, rate);
      }
      return convertMoney(quote.amount, precisionForAssetType(assetType), accountPrec, rate);
    };

    const result: PositionDto[] = [];
    for (const row of rows) {
      const asset = assetMap.get(row.assetId);
      if (!asset) continue;

      const quantity = Number(row.quantity);
      const avgCostBasis: Money = {
        amount: row.avgCostBasisAmount,
        currency: row.avgCostBasisCurrency,
      };

      let currentPrice: Money | undefined;
      let currentValue: Money | undefined;
      let unrealizedPnl: Money | undefined;
      try {
        currentPrice =
          currentPriceOf?.(row.assetId) ??
          (await this.prices.getPrice(asset.symbol, asset.type, asset.isin ?? undefined));
        const priceInAccount =
          currentPrice.currency.toUpperCase() === row.currency.toUpperCase()
            ? currentPrice.amount
            : await quoteToAccount(currentPrice, row.currency, asset.type);
        const v = valuePosition({
          quantity,
          avgCostBasisMinors: row.avgCostBasisAmount,
          currentPriceMinors: priceInAccount,
        });
        currentValue = { amount: v.currentValueMinors, currency: row.currency };
        unrealizedPnl = { amount: v.unrealizedPnlMinors, currency: row.currency };
      } catch {
        // нет источника цены — позиция без оценки
      }

      const realized = realizedByAsset.get(row.assetId);

      let buyCostToday = 0;
      let sellProceedsToday = 0;
      for (const t of txs) {
        if (t.date === today && t.assetId === row.assetId) {
          if (t.type === TransactionType.BUY || t.type === TransactionType.OPENING) {
            buyCostToday += t.amountAmount;
          } else if (t.type === TransactionType.SELL) {
            sellProceedsToday += t.amountAmount;
          }
        }
      }

      let dayChange: Money | undefined;
      let dayChangePct: number | null = null;
      if (currentValue && yesterdayPriceOf && currentPrice) {
        const yPrice = yesterdayPriceOf(row.assetId);
        if (yPrice) {
          const yQty = Math.max(0, qtyYesterday.get(row.assetId) ?? 0);
          const yQuote: Money = {
            amount: yPrice.amount,
            currency: currentPrice.currency,
          };
          const yPriceAccount =
            yQuote.currency.toUpperCase() === row.currency.toUpperCase()
              ? yQuote.amount
              : await quoteToAccount(yQuote, row.currency, asset.type);
          const yValue = Math.round(yQty * yPriceAccount);
          const dc = currentValue.amount - yValue - buyCostToday + sellProceedsToday;
          dayChange = { amount: dc, currency: row.currency };
          dayChangePct = yValue > 0 ? (dc / yValue) * 100 : null;
        }
      }

      result.push({
        accountId: row.accountId,
        assetId: row.assetId,
        asset: this.toAssetDto(asset),
        quantity,
        avgCostBasis,
        currentPrice,
        currentValue,
        unrealizedPnl,
        realizedPnl: realized !== undefined ? { amount: realized, currency: row.currency } : undefined,
        dayChange,
        dayChangePct,
      });
    }
    return result;
  }

  /**
   * Резолверы цен: current + previousClose через PriceService (кэш 15 мин / день).
   * Без previousClose — подставляем current (ценовой dayChange = 0).
   */
  private async buildPriceResolvers(
    assets: Asset[],
  ): Promise<{
    currentPriceOf: (assetId: string) => Money | undefined;
    yesterdayPriceOf: (assetId: string) => ResolvedPrice | undefined;
  }> {
    const currentMap = new Map<string, Money>();
    const yesterdayMap = new Map<string, ResolvedPrice>();

    await Promise.all(
      assets.map(async (a) => {
        try {
          const prices = await this.prices.getPriceWithPrevious(a.symbol, a.type, a.isin ?? undefined);
          currentMap.set(a.id, prices.current);
          if (prices.previousClose) {
            yesterdayMap.set(a.id, { amount: prices.previousClose.amount });
          } else {
            yesterdayMap.set(a.id, { amount: prices.current.amount });
          }
        } catch {
          // нет источника цены
        }
      }),
    );

    return {
      currentPriceOf: (assetId: string) => currentMap.get(assetId),
      yesterdayPriceOf: (assetId: string) => yesterdayMap.get(assetId),
    };
  }

  /** Синтетическая строка «Кэш» в конце списка (если книга двигала деньги). */
  private appendCash(
    account: Account,
    positions: PositionDto[],
    txs: Transaction[],
  ): PositionDto[] {
    const inputs: CashTransactionInput[] = txs.map((t) => ({
      type: t.type,
      amountMinors: t.amountAmount,
      feeMinors: t.feeAmount,
      taxMinors: t.taxAmount,
    }));
    if (!hasCashAffectingTransactions(inputs)) return positions;

    const balance = calculateCashBalance(inputs);
    const money: Money = { amount: balance, currency: account.currency };
    const cash: PositionDto = {
      accountId: account.id,
      assetId: CASH_ASSET_ID,
      asset: {
        id: CASH_ASSET_ID,
        symbol: 'CASH',
        name: 'Кэш',
        type: AssetType.CASH,
        currency: account.currency,
      },
      quantity: 1,
      avgCostBasis: money,
      currentPrice: money,
      currentValue: money,
      unrealizedPnl: { amount: 0, currency: account.currency },
    };
    return [...positions, cash];
  }
}
