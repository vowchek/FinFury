# ADR-006: Доходы — дивиденды/купоны как income events

**Status:** Accepted (реализовано)
**Date:** 2026-09-09
**Deciders:** Владелец проекта

## Context

Нужно учитывать дивиденды, купоны и прочие доходы. Вопрос: как их моделировать — только как денежные операции или как отдельные события с богатой семантикой (даты, налоги, реинвестирование)?

## Decision

Моделировать доходы как **income events** (отдельная сущность `IncomeEvent`), а не только как денежные транзакции. Денежное зачисление — связанная транзакция, но не единственное представление.

## Options Considered

### Option A: IncomeEvent как отдельная сущность — выбрано
| Dimension | Assessment |
|---|---|
| Complexity | Medium |
| Cost | Низкий |
| Scalability | Достаточно |
| Team familiarity | Средняя |

**Pros:** полная семантика (даты, налоги, DRIP); корректная статистика доходности; поддержка будущих корп. действий.
**Cons:** чуть больше модели.

### Option B: Только денежная транзакция (dividend/coupon)
| Dimension | Assessment |
|---|---|
| Complexity | Low |
| Cost | Низкий |
| Scalability | Достаточно |
| Team familiarity | Высокая |

**Pros:** просто.
**Cons:** теряется семантика: нет ex-date/record-date, нет отдельного учёта налогов и реинвестирования; сложно считать доходность.

### Option C: Только accrual (начисление по ex-date)
| Dimension | Assessment |
|---|---|
| Complexity | High |
| Cost | Средний |
| Scalability | Достаточно |
| Team familiarity | Низкая |

**Pros:** точный accrual-учёт.
**Cons:** сложно; для личного приложения избыточно.

## Trade-off Analysis

Для личного приложения важен баланс: корректно учитывать доходы (дивиденды/купоны) и их налоги, но без избыточной сложности accrual-учёта. IncomeEvent даёт нужную семантику. Ключевые даты (best practice): **announcement, ex-date, record-date, payment-date**. Учёт по payment-date (cash basis) — простой и достаточный; ex-date хранится для справки. Реинвестирование (DRIP) — доход + покупка.

## Consequences

- `IncomeEvent`: тип (dividend/coupon/interest/distribution), даты (announcement/ex/record/payment), gross, taxWithheld, net, currency, reinvested.
- Денежное зачисление — связанная транзакция (тип `income`), но не единственное представление.
- Учёт по payment-date (cash basis); ex-date хранится для справки.
- Статистика доходности (yield, total return) строится на income events.

## Action Items
1. [x] Сущность IncomeEvent и связь с транзакцией (DTO есть в `packages/contracts`, реализация — фаза 2).
2. [x] Обработка налогов (tax) и DRIP.
3. [x] Отчёт по доходам (`GET /income/stats` + UI-экраны списка и отчёта; yield — подзадача 2.3).

> **Примечание:** реализовано в фазе 2 (модуль `income`, см. [docs/features/income.md](../features/income.md)). DTO `IncomeEventDto`/`CreateIncomeEventDto`/`IncomeStatsDto` объявлены в `packages/contracts`.