# Позиции и портфель

> Позиция — не правда, а быстрый итог книги. Правда — транзакции.

Модуль: `apps/api/src/modules/positions/` (+ `lots/`).  
Маршруты — [контракт API](../api/contract.md).

## Суть

| Понятие | Смысл |
|---|---|
| **AVCO** | Средняя цена оставшихся бумаг |
| **FIFO-партии** | Пачки покупок; продажа списывает старые первыми → realized PnL |
| **Кэш `__cash__`** | Остаток денег из книги; в БД позиций нет |
| **displayCurrency** | Итоги портфеля в выбранной валюте; счета — в своей |

## Как это работает

**Пересчёт счёта** (после любой мутации книги):

1. AVCO → таблица `positions`
2. FIFO → таблица `lots` + `realizedPnl` на sell

**Оценка:** количество × текущая цена; unrealized = стоимость − себестоимость. Нет цены — позиция без оценки, без падения API.

**Портфель** `GET /portfolio?displayCurrency=`: корневые `total*` и `allocation[]` через FX; `accounts[]` нативные. `allocation` — доли по `AssetType` от `currentValue` (включая синтетический кэш); нулевые типы и позиции без цены не входят; `weightPct` суммируется в 100 (largest remainder, шаг 0.1).

**Кэш счёта:** deposit/income/+продажи минус withdrawal/fee/buy… (`cash-balance.ts`).

## Где в коде

| Часть | Путь |
|---|---|
| AVCO / оценка / кэш | `position-calculator.ts`, `position-valuation.ts`, `cash-balance.ts` |
| Портфель | `portfolio.service.ts` |
| Партии | `apps/api/src/modules/lots/` |

## См. также

- [Состав](composition.md)
- [Цены / FX](prices.md)
- [ADR-003](../decisions/ADR-003-transaction-ledger.md), [ADR-009](../decisions/ADR-009-fx-rates.md)
