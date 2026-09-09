import { Money } from '@finfury/contracts';
import { PriceProvider, PriceWithPrevious } from './price-provider.interface';

/** Запись кэша: текущая цена (TTL) + previousClose на календарный день. */
export interface PriceCacheEntry {
  current: Money;
  /** Истечение актуальности текущей цены. */
  currentExpiresAt: number;
  /** Цена предыдущего закрытия; стабильна в течение `previousCloseDate`. */
  previousClose: Money | null;
  /** UTC-дата `YYYY-MM-DD`, на которую зафиксирован previousClose. */
  previousCloseDate: string | null;
}

/** UTC-дата сегодняшнего дня (`YYYY-MM-DD`). */
export function utcToday(nowMs: number = Date.now()): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/**
 * Кэш цен (ADR-005): снижает лимиты внешних API и ускоряет дашборд.
 *
 * - Текущая цена: TTL (по умолчанию 15 мин) — повторные запросы к провайдеру не чаще.
 * - previousClose: фиксируется на календарный день (UTC); пока дата та же —
 *   повторно у провайдера не запрашиваем (day change без лишних round-trip).
 *
 * In-memory; в production может быть заменена на Redis или таблицу Price в БД.
 */
export class PriceCache {
  private readonly store = new Map<string, PriceCacheEntry>();

  /** @param currentTtlMs TTL текущей цены (по умолчанию 15 минут). */
  constructor(private readonly currentTtlMs: number = 900_000) {}

  private key(symbol: string, assetType: string): string {
    return `${assetType}:${symbol}`;
  }

  /** Текущая цена, если TTL ещё не истёк. */
  get(symbol: string, assetType: string, nowMs: number = Date.now()): Money | null {
    const entry = this.store.get(this.key(symbol, assetType));
    if (!entry) return null;
    if (entry.currentExpiresAt < nowMs) return null;
    return entry.current;
  }

  /**
   * Пара current + previousClose, если текущая цена свежая
   * и previousClose относится к сегодняшнему UTC-дню.
   */
  getWithPrevious(
    symbol: string,
    assetType: string,
    nowMs: number = Date.now(),
  ): PriceWithPrevious | null {
    const entry = this.store.get(this.key(symbol, assetType));
    if (!entry) return null;
    if (entry.currentExpiresAt < nowMs) return null;
    if (entry.previousCloseDate !== utcToday(nowMs)) return null;
    return { current: entry.current, previousClose: entry.previousClose };
  }

  /**
   * previousClose на сегодня (даже если текущая цена протухла) —
   * можно обновить только current без повторного запроса previousClose.
   */
  getPreviousCloseForToday(
    symbol: string,
    assetType: string,
    nowMs: number = Date.now(),
  ): Money | null | undefined {
    const entry = this.store.get(this.key(symbol, assetType));
    if (!entry || entry.previousCloseDate !== utcToday(nowMs)) return undefined;
    return entry.previousClose;
  }

  /** Записать только текущую цену; previousClose за сегодня сохраняется. */
  set(symbol: string, assetType: string, value: Money, nowMs: number = Date.now()): void {
    const k = this.key(symbol, assetType);
    const prev = this.store.get(k);
    const today = utcToday(nowMs);
    const keepPrev = prev && prev.previousCloseDate === today;
    this.store.set(k, {
      current: value,
      currentExpiresAt: nowMs + this.currentTtlMs,
      previousClose: keepPrev ? prev.previousClose : null,
      previousCloseDate: keepPrev ? today : null,
    });
  }

  /** Записать current + previousClose на сегодняшний день. */
  setWithPrevious(
    symbol: string,
    assetType: string,
    value: PriceWithPrevious,
    nowMs: number = Date.now(),
  ): void {
    this.store.set(this.key(symbol, assetType), {
      current: value.current,
      currentExpiresAt: nowMs + this.currentTtlMs,
      previousClose: value.previousClose,
      previousCloseDate: utcToday(nowMs),
    });
  }
}

/**
 * Адаптер-заглушка для тестов. В runtime не подключён —
 * PriceService использует MOEX / Yahoo / CoinGecko.
 */
export class StubPriceProvider implements PriceProvider {
  readonly name = 'stub';

  supports(): boolean {
    return true;
  }

  async getPrice(_symbol: string): Promise<Money> {
    return { amount: 10000, currency: 'RUB' };
  }

  async getPriceWithPrevious(_symbol: string): Promise<PriceWithPrevious> {
    const current: Money = { amount: 10000, currency: 'RUB' };
    return { current, previousClose: current };
  }
}
