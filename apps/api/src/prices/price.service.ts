import { Injectable } from '@nestjs/common';
import { AssetType, Money } from '@finfury/contracts';
import { PriceCache, StubPriceProvider } from './price-cache';
import { PriceProvider } from './price-provider.interface';

/**
 * Сервис цен (ADR-005). Единственная точка входа для получения цен.
 * Использует кэш + fallback-цепочку провайдеров.
 */
@Injectable()
export class PriceService {
  private readonly cache = new PriceCache();
  private readonly providers: PriceProvider[] = [new StubPriceProvider()];

  async getPrice(symbol: string, assetType: AssetType): Promise<Money> {
    const cached = this.cache.get(symbol, assetType);
    if (cached) return cached;

    for (const provider of this.providers) {
      if (!provider.supports(assetType)) continue;
      try {
        const price = await provider.getPrice(symbol, assetType);
        this.cache.set(symbol, assetType, price);
        return price;
      } catch {
        // пробуем следующий провайдер
        continue;
      }
    }

    throw new Error(`Нет источника цены для ${symbol} (${assetType})`);
  }
}