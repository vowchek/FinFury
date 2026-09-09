# Транзакции

> Единая книга: каждая сделка — строка. После записи пересчитываются позиции и партии.

Модуль: `apps/api/src/modules/transactions/`. Решение — [ADR-003](../decisions/ADR-003-transaction-ledger.md).  
Маршруты — [контракт API](../api/contract.md).

## Суть

Типы: buy, sell, deposit, withdrawal, opening, income, …  
Деньги в БД — в **валюте счёта**. Если ввёл цену в валюте актива — сервер конвертирует (FX, ADR-009). Нет курса → 400.

Продажа сверх остатка партий → 400.

## Как это работает

**Создание / правка / удаление** → проверка владельца → запись → `PositionsService.recalcForAccount` → `LotsService.recalcForAccount`.

**Снапшот** (`POST …/opening`): только на **пустой** счёт (иначе 409). Список позиций → `opening`-транзакции на одну дату. В UI можно сразу указать доход по строке — фронт после opening вызывает `POST /income` с `distributed: true` (в PnL, не в кэш; контракт opening не меняется).

В ответе `TransactionDto` у sell может быть `realizedPnl` (считается при пересчёте партий; в create/update не передаётся).

## Где в коде

| Часть | Путь |
|---|---|
| Сервис | `apps/api/src/modules/transactions/transactions.service.ts` |
| Форма UI | `apps/web/src/dashboard/TransactionForm.tsx` |
| Снапшот UI | `apps/web/src/dashboard/OpeningForm.tsx` |

## См. также

- [Позиции](positions.md)
- [Режимы ввода](../architecture/data-entry-modes.md)
- [Состав](composition.md)
