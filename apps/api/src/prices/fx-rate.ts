/**
 * Абстракция источника FX mid-rate (ADR-009).
 * Бизнес-логика обращается через PriceService.getFxRate, не к API напрямую.
 */
export interface FxRate {
  /** Сколько единиц `to` (major) за 1 единицу `from` (major). */
  rate: number;
  from: string;
  to: string;
  /** Дата курса у провайдера (последний торговый день), YYYY-MM-DD. */
  asOf: string;
  source: string;
}

export interface FxRateProvider {
  readonly name: string;
  /** Mid-rate from→to. Одинаковые валюты → rate 1. */
  getRate(from: string, to: string): Promise<FxRate>;
}

/** In-memory кэш FX (TTL как у текущих цен — 15 мин). */
export class FxRateCache {
  private readonly store = new Map<string, { rate: FxRate; expiresAt: number }>();

  constructor(private readonly ttlMs: number = 900_000) {}

  private key(from: string, to: string): string {
    return `${from.toUpperCase()}:${to.toUpperCase()}`;
  }

  get(from: string, to: string, nowMs: number = Date.now()): FxRate | null {
    const entry = this.store.get(this.key(from, to));
    if (!entry || entry.expiresAt < nowMs) return null;
    return entry.rate;
  }

  set(rate: FxRate, nowMs: number = Date.now()): void {
    this.store.set(this.key(rate.from, rate.to), {
      rate,
      expiresAt: nowMs + this.ttlMs,
    });
  }
}

/**
 * Stub для тестов. Курсы фиксированы; в runtime не подключён.
 * USD→RUB = 100 (удобно для арифметики в тестах).
 */
export class StubFxRateProvider implements FxRateProvider {
  readonly name = 'stub-fx';

  constructor(
    private readonly rates: Record<string, number> = {
      'USD:RUB': 100,
      'EUR:RUB': 110,
      'EUR:USD': 1.1,
    },
  ) {}

  async getRate(from: string, to: string): Promise<FxRate> {
    const f = from.toUpperCase();
    const t = to.toUpperCase();
    if (f === t) {
      return { rate: 1, from: f, to: t, asOf: '1970-01-01', source: this.name };
    }
    const direct = this.rates[`${f}:${t}`];
    if (direct !== undefined) {
      return { rate: direct, from: f, to: t, asOf: '1970-01-01', source: this.name };
    }
    const inverse = this.rates[`${t}:${f}`];
    if (inverse !== undefined && inverse !== 0) {
      return { rate: 1 / inverse, from: f, to: t, asOf: '1970-01-01', source: this.name };
    }
    throw new Error(`Stub FX: нет курса ${f}/${t}`);
  }
}
