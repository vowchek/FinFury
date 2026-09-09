# ADR-005: Оценка активов — абстракция PriceProvider

**Status:** Accepted (адаптеры + кэш + FX готовы; таблица истории цен — позже)
**Date:** 2026-09-09
**Deciders:** Владелец проекта

## Context

Стоимость активов должна подгружаться из внешних источников (акции, облигации, крипто, FX). Источников несколько, они меняются, имеют лимиты и могут падать. Нужно избежать жёсткой привязки бизнес-логики к конкретному провайдеру.

## Decision

Ввести абстракцию **`PriceProvider`**: интерфейс + набор адаптеров + кэш. Бизнес-логика обращается только к абстракции, никогда напрямую к внешним API.

## Options Considered

### Option A: PriceProvider (абстракция + адаптеры + кэш) — выбрано
| Dimension | Assessment |
|---|---|
| Complexity | Medium |
| Cost | Низкий |
| Scalability | Высокая |
| Team familiarity | Средняя |

**Pros:** смена/добавление источника — без изменения бизнес-логики; кэш снижает лимиты и задержки; fallback между провайдерами; тестируемость (mock-адаптер).
**Cons:** нужен дизайн интерфейса и кэша.

### Option B: Прямые вызовы API из бизнес-логики
| Dimension | Assessment |
|---|---|
| Complexity | Low |
| Cost | Низкий |
| Scalability | Низкая |
| Team familiarity | Высокая |

**Pros:** просто.
**Cons:** жёсткая привязка к провайдеру; лимиты и падения бьют по всему приложению; сложно тестировать.

### Option C: Готовая библиотека/агрегатор цен
| Dimension | Assessment |
|---|---|
| Complexity | Low-Medium |
| Cost | Средний (подписка) |
| Scalability | Высокая |
| Team familiarity | Средняя |

**Pros:** меньше кода.
**Cons:** внешняя зависимость и стоимость; меньше контроля над источниками и кэшем.

## Trade-off Analysis

Внешние источники цен — нестабильная часть системы (лимиты, падения, смена API). Абстракция `PriceProvider` изолирует эту нестабильность и позволяет добавлять провайдеров по мере необходимости (акции: Yahoo/Finnhub/Alpha Vantage; крипто: CoinGecko/Binance; FX: отдельный адаптер). Кэш обязателен для снижения лимитов и ускорения дашборда.

## Consequences

- Интерфейс `PriceProvider.getPrice(asset, date)` + `getHistory(asset, range)`.
- Адаптеры: stocks, crypto, fx; fallback-цепочка.
- Кэш цен: текущая — TTL 15 мин; previousClose — на календарный день (UTC), in-memory; в перспективе — Redis / таблица `Price`.
- История цен хранится для оценки на дату и графиков (таблица `Price` — позже).
- Бизнес-логика никогда не вызывает внешние API напрямую.

## Action Items
1. [x] Интерфейс PriceProvider и базовый кэш (`PriceProvider`, `PriceCache`, `StubPriceProvider`).
2. [x] Адаптеры: MOEX (российские акции/облигации/ETF), Yahoo Finance (иностранные бумаги), CoinGecko (крипто).
3. [x] Fallback-цепочка и обработка лимитов (`RateLimiter`).
4. [x] Кэш previousClose на день + TTL текущей цены 15 мин (day change без лишних запросов).
5. [x] FX-адаптер (валютные курсы); см. [ADR-009](ADR-009-fx-rates.md).
6. [ ] История цен (таблица `Price`) — позже.

> **Примечание:** реализованы интерфейс, кэш (current TTL + previousClose на день) и `PriceService` с fallback-цепочкой. Адаптеры MOEX / Yahoo / CoinGecko подключены. FX mid-rate — Frankfurter через `PriceService.getFxRate` (ADR-009). `StubPriceProvider` / `StubFxRateProvider` — только для тестов. Таблица `Price` — см. [docs/features/prices](../features/prices.md).
