import { FxRate, FxRateProvider } from './fx-rate';

/**
 * Frankfurter (ECB mid-rate) — бесплатный FX без ключа (ADR-009).
 * На выходных/праздниках отдаёт последний торговый день — это ожидаемо (stale OK).
 */
export class FrankfurterFxProvider implements FxRateProvider {
  readonly name = 'frankfurter';

  constructor(private readonly baseUrl: string = 'https://api.frankfurter.app') {}

  async getRate(from: string, to: string): Promise<FxRate> {
    const f = from.toUpperCase();
    const t = to.toUpperCase();
    if (f === t) {
      return {
        rate: 1,
        from: f,
        to: t,
        asOf: new Date().toISOString().slice(0, 10),
        source: this.name,
      };
    }

    const url = `${this.baseUrl}/latest?from=${encodeURIComponent(f)}&to=${encodeURIComponent(t)}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Frankfurter HTTP ${res.status} for ${f}/${t}`);
    }
    const body = (await res.json()) as {
      date?: string;
      rates?: Record<string, number>;
    };
    const rate = body.rates?.[t];
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
      throw new Error(`Frankfurter: нет курса ${f}/${t}`);
    }
    return {
      rate,
      from: f,
      to: t,
      asOf: body.date ?? new Date().toISOString().slice(0, 10),
      source: this.name,
    };
  }
}
