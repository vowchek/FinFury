# Цены и курсы

> Бизнес-код не ходит на биржу сам — только через PriceProvider. Курсы валют — отдельно.

Модуль: `apps/api/src/prices/`.  
[ADR-005](../decisions/ADR-005-price-provider.md), [ADR-009](../decisions/ADR-009-fx-rates.md).

## Суть

1. Спросить цену → кэш (≈15 мин) → цепочка провайдеров.
2. FX mid-rate: CBR (пары с RUB) → Frankfurter (USD/EUR); кэш 15 мин.
3. Конвертация денег — `convertMoney` (BigInt), особенно при смене precision 2↔6.

| Провайдер | Что кроет |
|---|---|
| MOEX | РФ акции / облигации / ETF |
| Yahoo | иностранные бумаги |
| CoinGecko | крипта (USD, precision 6) |

## Как это работает

- `getPriceWithPrevious` — текущая + вчерашнее закрытие (day change); previousClose кэшируется на UTC-день.
- Оценка портфеля: котировка → FX в валюту счёта → `valuePosition`.
- Запись сделки: цена в валюте актива → FX в валюту счёта.
- Display currency на дашборде — precision 2.

Ограничения: нет таблицы истории цен; кэш in-memory; FX — mid-rate, не курс брокера.

## Где в коде

| Часть | Путь |
|---|---|
| Сервис | `price.service.ts` |
| FX | `apps/api/src/prices/fx-rate.ts`, `cbr.fx.ts`, `frankfurter.fx.ts`; конвертация — `apps/api/src/common/fx-convert.ts` |
| Адаптеры | `moex.provider.ts`, `yahoo.provider.ts`, `coingecko.provider.ts` |

## См. также

- [Позиции](positions.md)
- [Активы](accounts-assets.md)
