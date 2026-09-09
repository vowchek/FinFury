import { FxRate, FxRateProvider } from './fx-rate';

interface CbrValute {
  CharCode: string;
  Nominal: number;
  Value: number;
}

interface CbrDailyJson {
  Date?: string;
  Valute?: Record<string, CbrValute>;
}

/**
 * Курсы ЦБ РФ (JSON-зеркало daily_json.js) — для пар с RUB (ADR-009).
 * ECB/Frankfurter больше не публикует RUB; без CBR сводка в рублях невозможна.
 * Value — рублей за Nominal единиц валюты (mid официальный).
 */
export class CbrFxProvider implements FxRateProvider {
  readonly name = 'cbr';

  constructor(
    private readonly url: string = 'https://www.cbr-xml-daily.ru/daily_json.js',
  ) {}

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

    if (f !== 'RUB' && t !== 'RUB') {
      throw new Error('CBR: только пары с RUB');
    }

    const body = await this.fetchDaily();
    const asOf = (body.Date ?? new Date().toISOString()).slice(0, 10);
    const rubPer = (code: string): number => {
      if (code === 'RUB') return 1;
      const v = body.Valute?.[code];
      if (!v || !v.Nominal || !v.Value) {
        throw new Error(`CBR: нет курса ${code}`);
      }
      return v.Value / v.Nominal;
    };

    // XXX→RUB = rubPer(XXX); RUB→XXX = 1/rubPer; XXX→YYY = rubPer(XXX)/rubPer(YYY)
    const rate = rubPer(f) / rubPer(t);
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error(`CBR: невалидный курс ${f}/${t}`);
    }
    return { rate, from: f, to: t, asOf, source: this.name };
  }

  private async fetchDaily(): Promise<CbrDailyJson> {
    const res = await fetch(this.url);
    if (!res.ok) throw new Error(`CBR HTTP ${res.status}`);
    return (await res.json()) as CbrDailyJson;
  }
}
