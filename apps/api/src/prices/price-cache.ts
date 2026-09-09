import { Money } from '@vowchek/contracts';
import { PriceProvider } from './price-provider.interface';

/**
 * Кэш цен (ADR-005): снижает лимиты внешних API и ускоряет дашборд.
 * Простая in-memory реализация с TTL; в production может быть заменена
 * на Redis или таблицу Price в БД.
 */
export class PriceCache {
  private readonly store = new Map<string, { value: Money; expiresAt: number }>();

  constructor(private readonly ttlMs: number = 60_000) {}

  private key(symbol: string, assetType: string): string {
    return `${assetType}:${symbol}`;
  }

  get(symbol: string, assetType: string): Money | null {
    const entry = this.store.get(this.key(symbol, assetType));
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.store.delete(this.key(symbol, assetType));
      return null;
    }
    return entry.value;
  }

  set(symbol: string, assetType: string, value: Money): void {
    this.store.set(this.key(symbol, assetType), {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }
}

/**
 * Адаптер-заглушка. Реальные адаптеры (акции/крипто/FX) подключаются
 * по мере выбора провайдеров (см. ADR-005, roadmap фаза 1).
 */
export class StubPriceProvider implements PriceProvider {
  readonly name = 'stub';

  supports(): boolean {
    return true;
  }

  async getPrice(_symbol: string): Promise<Money> {
    // Заглушка: возвращает условную цену. Заменить на реальный источник.
    return { amount: 10000, currency: 'RUB' };
  }
}