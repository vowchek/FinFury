import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  HistoryInterval,
  HistoryPeriodDto,
  PortfolioHistoryDto,
  PortfolioHistoryPointDto,
} from '@finfury/contracts';
import { In, Repository } from 'typeorm';
import { PriceService } from '../../prices/price.service';
import { Account } from '../accounts/account.entity';
import { Asset } from '../assets/asset.entity';
import { Transaction } from '../transactions/transaction.entity';
import { cashDelta } from '../positions/cash-balance';
import {
  HistoryTxInput,
  ResolvedPrice,
  buildBuckets,
  dietz,
  netFlowIn,
  toIsoDate,
  toUtcMs,
  valueAt,
} from './history-calculator';
import { HistoryQueryDto } from './history.dto';

const DAY_MS = 86_400_000;

/**
 * История стоимости портфеля/счёта (фаза 2, подзадача 2.4; ADR-008).
 * Расчёт на лету от транзакций книги; цены — текущие (PriceService, ADR-005),
 * при недоступности — себестоимость. Изоляция по userId.
 */
@Injectable()
export class HistoryService {
  constructor(
    @InjectRepository(Account)
    private readonly accounts: Repository<Account>,
    @InjectRepository(Asset)
    private readonly assets: Repository<Asset>,
    @InjectRepository(Transaction)
    private readonly transactions: Repository<Transaction>,
    private readonly prices: PriceService,
  ) {}

  /** История всего портфеля (все счета пользователя). */
  async getPortfolioHistory(userId: string, query: HistoryQueryDto): Promise<PortfolioHistoryDto> {
    const owned = await this.accounts.find({ where: { userId }, order: { createdAt: 'ASC' } });
    if (owned.length === 0) return this.empty('portfolio', query);
    return this.buildHistory(owned, 'portfolio', query);
  }

  /** История одного счёта (404 — не принадлежит пользователю). */
  async getAccountHistory(
    userId: string,
    accountId: string,
    query: HistoryQueryDto,
  ): Promise<PortfolioHistoryDto> {
    const account = await this.accounts.findOne({ where: { id: accountId, userId } });
    if (!account) throw new NotFoundException('Счёт не найден');
    return this.buildHistory([account], 'account', query);
  }

  /** Пустой ответ (нет счетов/диапазон вывернут). */
  private empty(scope: 'portfolio' | 'account', query: HistoryQueryDto): PortfolioHistoryDto {
    const today = toIsoDate(Date.now());
    const to = query.to ?? today;
    const from = query.from ?? to;
    return {
      scope,
      currency: 'RUB',
      from,
      to,
      interval: query.interval ?? HistoryInterval.DAY,
      points: [],
      returns: [],
      totalReturn: null,
    };
  }

  private async buildHistory(
    owned: Account[],
    scope: 'portfolio' | 'account',
    query: HistoryQueryDto,
  ): Promise<PortfolioHistoryDto> {
    // ADR-008: расчёт истории на лету от транзакций книги
    const accountIds = owned.map((a) => a.id);
    const rows = await this.transactions.find({
      where: { accountId: In(accountIds) },
      order: { date: 'ASC', createdAt: 'ASC' },
    });
    const currency = owned[0].currency;

    const to = query.to ?? toIsoDate(Date.now());
    const firstTxDate = rows.length > 0 ? rows[0].date : null;
    const from = query.from ?? firstTxDate ?? toIsoDate(Date.now() - 30 * DAY_MS);
    if (toUtcMs(from) > toUtcMs(to)) {
      return this.empty(scope, { ...query, from: to, to });
    }

    const txs: HistoryTxInput[] = rows.map((t) => ({
      date: t.date,
      type: t.type,
      assetId: t.assetId,
      quantity: t.quantity !== null ? Number(t.quantity) : null,
      priceMinors: t.priceAmount,
      amountMinors: t.amountAmount,
      feeMinors: t.feeAmount,
      taxMinors: t.taxAmount,
    }));

    // Цены резолвим один раз на актив (кэш PriceService); ошибки — fallback на себестоимость.
    const assetIds = [...new Set(rows.map((t) => t.assetId).filter((id): id is string => id !== null))];
    const assetRows = assetIds.length > 0 ? await this.assets.find({ where: { id: In(assetIds) } }) : [];
    const priceOf = await this.buildPriceResolver(assetRows);

    const { ends, interval } = buildBuckets(from, to, query.interval ?? this.defaultInterval(from, to));

    const points: PortfolioHistoryPointDto[] = ends.map((date) => {
      const v = valueAt(txs, date, priceOf);
      return {
        date,
        value: { amount: v.valueMinors, currency },
        invested: { amount: v.investedMinors, currency },
        contributions: { amount: v.contributionsMinors, currency },
        cash: { amount: v.cashMinors, currency },
        priceSource: v.priceSource,
      };
    });

    const valueOn = (date: string): number => valueAt(txs, date, priceOf).valueMinors;

    const returns = this.monthlyReturns(txs, valueOn, from, to, currency);
    const total = dietz(
      valueOn(toIsoDate(toUtcMs(from) - DAY_MS)),
      valueOn(to),
      this.flowsIn(txs, from, to),
      from,
      to,
    );

    return {
      scope,
      currency,
      from,
      to,
      interval,
      points,
      returns,
      totalReturn: total.returnPct,
    };
  }

  /** Доходность по календарным месяцам внутри диапазона (Modified Dietz). */
  private monthlyReturns(
    txs: HistoryTxInput[],
    valueOn: (date: string) => number,
    from: string,
    to: string,
    currency: string,
  ): HistoryPeriodDto[] {
    const periods: HistoryPeriodDto[] = [];
    let cursor = toUtcMs(from);
    const end = toUtcMs(to);
    while (cursor <= end) {
      const monthEnd = Math.min(endOfMonth(cursor), end);
      const monthStart = cursor;
      const startKey = toIsoDate(monthStart);
      const endKey = toIsoDate(monthEnd);
      const valueStart = valueOn(toIsoDate(monthStart - DAY_MS));
      const valueEnd = valueOn(endKey);
      const d = dietz(valueStart, valueEnd, this.flowsIn(txs, startKey, endKey), startKey, endKey);
      periods.push({
        key: endKey.slice(0, 7),
        start: startKey,
        end: endKey,
        valueStart: { amount: valueStart, currency },
        valueEnd: { amount: valueEnd, currency },
        netFlow: { amount: netFlowIn(txs, startKey, endKey), currency },
        pnl: { amount: d.pnl, currency },
        returnPct: d.returnPct,
      });
      cursor = monthEnd + DAY_MS;
    }
    return periods;
  }

  private flowsIn(txs: HistoryTxInput[], from: string, to: string) {
    return txs
      .filter((t) => t.date >= from && t.date <= to)
      .map((t) => ({ date: t.date, amount: cashDelta(t) }));
  }

  /** Резолвер цены: текущая цена из PriceService, иначе undefined → себестоимость. */
  private async buildPriceResolver(
    assetRows: Asset[],
  ): Promise<(assetId: string) => ResolvedPrice | undefined> {
    const map = new Map<string, ResolvedPrice>();
    await Promise.all(
      assetRows.map(async (a) => {
        try {
          const price = await this.prices.getPrice(a.symbol, a.type, a.isin ?? undefined);
          map.set(a.id, { amount: price.amount });
        } catch {
          // нет источника цены — оценка по себестоимости
        }
      }),
    );
    return (assetId: string) => map.get(assetId);
  }

  /** Интервал по умолчанию из длины диапазона. */
  private defaultInterval(from: string, to: string): HistoryInterval {
    const days = (toUtcMs(to) - toUtcMs(from)) / DAY_MS;
    if (days <= 32) return HistoryInterval.DAY;
    if (days <= 210) return HistoryInterval.WEEK;
    return HistoryInterval.MONTH;
  }
}

/** Последний день месяца, содержащего дату (UTC). */
function endOfMonth(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0);
}
