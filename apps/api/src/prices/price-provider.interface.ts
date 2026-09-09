import { Money } from '@vowchek/contracts';

/**
 * Абстракция источника цен (ADR-005).
 * Бизнес-логика обращается только к этому интерфейсу,
 * никогда напрямую к внешним API.
 */
export interface PriceProvider {
  /** Идентификатор провайдера (для кэша и отладки) */
  readonly name: string;

  /** Поддерживает ли провайдер данный тип актива */
  supports(assetType: string): boolean;

  /** Текущая цена актива */
  getPrice(symbol: string, assetType: string): Promise<Money>;
}