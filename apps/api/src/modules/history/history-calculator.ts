import { HistoryInterval, TransactionType } from '@finfury/contracts';
import {
  calculateAverageCostBasis,
  CostTransactionInput,
} from '../positions/position-calculator';
import { cashDelta } from '../positions/cash-balance';

/**
 * Чистая логика истории стоимости (ADR-008): расчёт ведётся от транзакций
 * единой книги (ADR-003) без дополнительных сущностей.
 * Деньги — целые минимальные единицы (ADR-002). Даты — календарные дни UTC.
 */

/** Минимальный срез транзакции для расчёта истории. */
export interface HistoryTxInput {
  date: string; // YYYY-MM-DD
  type: TransactionType;
  assetId: string | null;
  quantity: number | null;
  priceMinors: number | null;
  amountMinors: number;
  feeMinors: number | null;
  taxMinors: number | null;
}

/** Цена актива за штуку в минимальных единицах (из PriceService). */
export interface ResolvedPrice {
  amount: number;
}

/** Значения в точке истории. */
export interface HistoryPointValue {
  valueMinors: number;
  /** Себестоимость открытых позиций (AVCO), без кэша. */
  investedMinors: number;
  /** Net contributions на дату: Σ deposit + Σ opening − Σ withdrawal. */
  contributionsMinors: number;
  cashMinors: number;
  priceSource: 'current' | 'cost';
}

const DAY_MS = 86_400_000;

/** 'YYYY-MM-DD' → миллисекунды UTC (полночь). */
export function toUtcMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

/** Миллисекунды UTC → 'YYYY-MM-DD'. */
export function toIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Последний день месяца, содержащего дату. */
function endOfMonthMs(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0);
}

/**
 * Границы бакетов (даты-концы) внутри [from, to].
 * Последняя точка всегда `to` (текущая стоимость важна для графика).
 * Если бакетов больше `maxBuckets`, интервал повышается (day→week→month).
 */
export function buildBuckets(
  from: string,
  to: string,
  interval: HistoryInterval,
  maxBuckets = 400,
): { ends: string[]; interval: HistoryInterval } {
  const start = toUtcMs(from);
  const end = toUtcMs(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return { ends: [], interval };
  }

  let effective = interval;
  let ends = bucketEnds(start, end, effective);
  const ladder: HistoryInterval[] = [HistoryInterval.DAY, HistoryInterval.WEEK, HistoryInterval.MONTH];
  while (ends.length > maxBuckets) {
    const next = ladder[ladder.indexOf(effective) + 1];
    if (!next) break;
    effective = next;
    ends = bucketEnds(start, end, effective);
  }
  return { ends, interval: effective };
}

function bucketEnds(start: number, end: number, interval: HistoryInterval): string[] {
  const ends: number[] = [];
  if (interval === HistoryInterval.DAY) {
    for (let t = start; t <= end; t += DAY_MS) ends.push(t);
  } else if (interval === HistoryInterval.WEEK) {
    // конец ISO-недели (воскресенье), первая — ближайшее воскресенье ≥ from
    const dow = new Date(start).getUTCDay();
    let t = start + ((7 - dow) % 7) * DAY_MS;
    for (; t <= end; t += 7 * DAY_MS) ends.push(t);
  } else {
    for (let t = endOfMonthMs(start); t <= end; t = endOfMonthMs(t + DAY_MS)) ends.push(t);
  }
  if (ends.length === 0 || ends[ends.length - 1] !== end) ends.push(end);
  return ends.map(toIsoDate);
}

/**
 * Стоимость портфеля/счёта на дату: кэш на дату + позиции по ценам.
 * Количества и себестоимость — переиспользование AVCO/кэша из позиций.
 * Цена недоступна → себестоимость (плоский участок), точка помечается 'cost'.
 */
export function valueAt(
  txs: HistoryTxInput[],
  date: string,
  priceOf: (assetId: string) => ResolvedPrice | undefined,
): HistoryPointValue {
  const upTo = txs.filter((t) => t.date <= date);

  const cash = upTo.reduce((sum, t) => sum + cashDelta(t), 0);
  const contributions = upTo.reduce((sum, t) => sum + contributionDelta(t), 0);

  const inputs: CostTransactionInput[] = upTo
    .filter((t) => t.assetId !== null)
    .map((t) => ({
      assetId: t.assetId as string,
      type: t.type,
      quantity: t.quantity ?? 0,
      priceMinors: t.priceMinors,
    }));
  const positions = calculateAverageCostBasis(inputs);

  let invested = 0;
  let marketValue = 0;
  let priceSource: 'current' | 'cost' = 'current';
  for (const p of positions) {
    const qty = Math.max(0, p.quantity); // защита от «минусовых» позиций в данных
    if (qty === 0) continue;
    const cost = Math.round(qty * p.avgCostBasisMinors);
    invested += cost;
    const price = priceOf(p.assetId);
    if (price) {
      marketValue += Math.round(qty * price.amount);
    } else {
      marketValue += cost;
      priceSource = 'cost';
    }
  }

  return {
    valueMinors: cash + marketValue,
    investedMinors: invested,
    contributionsMinors: contributions,
    cashMinors: cash,
    priceSource,
  };
}

/** Вклад во взносы одной транзакции (как UI «взносы» / lib/contributions). */
export function contributionDelta(tx: Pick<HistoryTxInput, 'type' | 'amountMinors'>): number {
  if (tx.type === TransactionType.DEPOSIT || tx.type === TransactionType.OPENING) {
    return tx.amountMinors;
  }
  if (tx.type === TransactionType.WITHDRAWAL) {
    return -tx.amountMinors;
  }
  return 0;
}

/**
 * Нетто-движение денег за период [from, to] (правила кэша: вводы +, выводы −).
 * Используется в Modified Dietz (ADR-008). Левая граница включена: valueStart
 * берётся на день до `from`, поэтому потоки в день `from` должны попасть в период.
 */
export function netFlowIn(txs: HistoryTxInput[], from: string, to: string): number {
  return txs
    .filter((t) => t.date >= from && t.date <= to)
    .reduce((sum, t) => sum + cashDelta(t), 0);
}

export interface DietzFlow {
  /** Дата движения, YYYY-MM-DD (внутри (from, to]). */
  date: string;
  /** Нетто-движение денег в минимальных единицах (+ввод, −вывод). */
  amount: number;
}

export interface DietzResult {
  pnl: number;
  returnPct: number | null;
}

/**
 * Modified Dietz: доходность периода с учётом движения денег.
 * pnl = Δvalue − netFlow; знаменатель = valueStart + Σ flow × вес,
 * вес — доля периода, оставшаяся после движения (движение в начале периода
 * работает весь период). null — делить не на что.
 */
export function dietz(
  startValue: number,
  endValue: number,
  flows: DietzFlow[],
  from: string,
  to: string,
): DietzResult {
  const start = toUtcMs(from);
  const end = toUtcMs(to);
  const span = end - start;
  if (span <= 0) return { pnl: 0, returnPct: null };

  let netFlow = 0;
  let weighted = 0;
  for (const f of flows) {
    netFlow += f.amount;
    const t = toUtcMs(f.date);
    const clamped = Math.min(Math.max(t, start), end);
    weighted += f.amount * ((end - clamped) / span);
  }

  const pnl = endValue - startValue - netFlow;
  const denom = startValue + weighted;
  const returnPct =
    denom > 0 ? Math.round((pnl / denom) * 100 * 100) / 100 : null;
  return { pnl, returnPct };
}
