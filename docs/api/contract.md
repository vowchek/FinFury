# Контракт API

> REST JSON, префикс `/api/v1`. Деньги — целые минимальные единицы + валюта.

## Общие правила

- Кроме `/auth/*` и `/health` нужен **Bearer** access-токен.
- **Деньги:** `{ "amount": 12345, "currency": "RUB" }` = 123.45 ₽. Без `float` ([ADR-002](../decisions/ADR-002-database.md)).
- Ошибки — единый формат (ниже). Данные только свои (`userId`).

## Статусы маршрутов

- **готово** — есть в коде.
- **позже** — в контракте как цель, ещё не сделано.

---

## Аутентификация

| Метод | Путь | Описание | Статус |
|---|---|---|---|
| POST | `/auth/register` | Регистрация (`email`, `password`, `name`) → `{ accessToken, refreshToken, user }` | ✅ |
| POST | `/auth/login` | Вход → `{ accessToken, refreshToken, user }` | ✅ |
| POST | `/auth/refresh` | Обновление пары токенов по refresh-токену | ✅ |
| POST | `/auth/logout` | Отзыв refresh-токена | позже |

> Логика — [docs/features/auth.md](../features/auth.md).

## Служебное

| Метод | Путь | Описание | Статус |
|---|---|---|---|
| GET | `/health` | Liveness: `{ status, service, time }`, без токена | готово |

## Счета

| Метод | Путь | Описание | Статус |
|---|---|---|---|
| GET | `/accounts` | Список счетов пользователя | ✅ |
| POST | `/accounts` | Создать счёт | ✅ |
| GET | `/accounts/:id` | Счёт по id | ✅ |
| PATCH | `/accounts/:id` | Обновить счёт | ✅ |
| DELETE | `/accounts/:id` | Удалить счёт (204) | ✅ |

## Активы (справочник)

| Метод | Путь | Описание | Статус |
|---|---|---|---|
| GET | `/assets?q=` | Поиск по символу/названию (только локальный справочник `assets`) | ✅ |
| GET | `/assets/external?q=&accountId=` | Поиск во внешних источниках с фильтром по типу счёта (BROKER→stock/bond/fund, WALLET→crypto); кэш `external_assets`. Нужен валидный `accountId` (чужой/нет → 404). Мин. длина `q` — 2 символа (короче → `[]`). | ✅ |
| GET | `/assets/:id` | Актив + текущая цена (`currentPrice`) | ✅ |
| POST | `/assets` | Авто-создание актива при выборе из внешних результатов (не для ручного создания) | ✅ |

## Транзакции (единая книга)

| Метод | Путь | Описание | Статус |
|---|---|---|---|
| POST | `/accounts/:accountId/transactions` | Создать транзакцию (buy/sell/dividend/…) | ✅ |
| GET | `/accounts/:accountId/transactions` | Список транзакций счёта | ✅ |
| PATCH | `/transactions/:id` | Обновить транзакцию | ✅ |
| DELETE | `/transactions/:id` | Удалить транзакцию (204) | ✅ |
| POST | `/accounts/:accountId/opening` | Snapshot-ввод → opening-транзакции (режим A) | ✅ |

## Позиции (производные)

| Метод | Путь | Описание | Статус |
|---|---|---|---|
| GET | `/accounts/:accountId/positions` | Позиции счёта + PnL; в конце синтетический «Кэш» (`assetId=__cash__`), если книга двигала деньги | ✅ |
| GET | `/accounts/:accountId/lots` | Партии счёта (cost basis по FIFO), фильтр `assetId?` | ✅ |
| GET | `/portfolio` | Сводка. Query `displayCurrency?`: корневые `total*` и `allocation[]` в этой валюте (FX); `accounts[]` всегда в валюте счёта; `totals[]` — нативные бакеты. Без параметра — `total*` / `allocation` = бакет `totals[0]`. | ✅ |

`allocation`: массив `{ type: AssetType, value: Money, weightPct: number }` — доли рыночной стоимости (`currentValue`) по типу актива; сегменты с `value ≤ 0` и позиции без цены не входят; сумма `weightPct` = 100 (largest remainder, шаг 0.1). Пустой портфель → `[]`.

## История стоимости (графики)

| Метод | Путь | Описание | Статус |
|---|---|---|---|
| GET | `/history?from&to&interval` | История стоимости всего портфеля | ✅ |
| GET | `/history/:accountId?from&to&interval` | История стоимости одного счёта | ✅ |

Query (все опциональны): `from`/`to` — `YYYY-MM-DD` (UTC; по умолчанию `to` = сегодня, `from` = первая транзакция или −30 дней); `interval` — `day` \| `week` \| `month` (иначе от длины диапазона). Ответ — `PortfolioHistoryDto` (`points` с `value` / `invested` / `contributions` / `cash` / `priceSource`, `returns` по месяцам Modified Dietz, `totalReturn`). `contributions` = Σ deposit + Σ opening − Σ withdrawal на дату (как «взносы» в составе). Чужой счёт → 404.

> Логика — [docs/features/history.md](../features/history.md), [ADR-008](../decisions/ADR-008-history-valuation.md).

> **Кэш:** не сущность БД. Баланс из транзакций (`calculateCashBalance`). Один остаток на счёт (доход без DRIP, deposit/withdrawal, buy/sell, fee/tax). Взносы (UI состава) по-прежнему без `income`.

### `GET /accounts/:accountId/lots`

Партии счёта — остатки покупок для cost basis по FIFO (подзадача 2.3). Изоляция по `userId` (404 для чужого счёта). Фильтр `assetId?` — только партии указанного актива. Сортировка: `acquiredAt ASC, createdAt ASC`.

```json
[
  {
    "id": "lot_1",
    "positionId": "pos_1",
    "assetId": "ast_1",
    "accountId": "acc_1",
    "quantity": 7,
    "costBasis": { "amount": 10000, "currency": "RUB" },
    "acquiredAt": "2026-09-01",
    "createdAt": "2026-09-09T10:00:00.000Z"
  }
]
```

`quantity` — остаток партии (дробное), `costBasis` — цена за штуку в минимальных единицах. Полная себестоимость остатка = `quantity × costBasis.amount` (считается на клиенте).

## Доходы (income events)

| Метод | Путь | Описание | Статус |
|---|---|---|---|
| POST | `/income` | Создать income event (дивиденд/купон/процент/распределение) | ✅ |
| GET | `/income` | Список доходов (фильтры: `accountId?`, `assetId?`, `from?`/`to?` по paymentDate) | ✅ |
| GET | `/income/stats` | Агрегаты gross/taxWithheld/net по периодам и активам + `yieldPct` (те же фильтры, что у `GET /income`) | ✅ |

> Логика — [docs/features/income.md](../features/income.md), решение — [ADR-006](../decisions/ADR-006-income-events.md).

## Расходы и бюджеты

| Метод | Путь | Описание | Статус |
|---|---|---|---|
| GET | `/expenses` | Список расходов | позже |
| POST | `/expenses` | Создать расход | позже |
| GET | `/categories` | Справочник категорий | позже |
| GET | `/budgets` | Бюджеты | позже |
| POST | `/budgets` | Создать бюджет | позже |

## Импорт (авто-режим)

| Метод | Путь | Описание | Статус |
|---|---|---|---|
| POST | `/import` | Загрузить отчёт (multipart CSV/XML) → предпросмотр | позже |
| GET | `/import/:batchId` | Статус и строки импорта | позже |
| POST | `/import/:batchId/confirm` | Подтвердить импорт в книгу | позже |
| GET | `/integrations` | Список брокерских интеграций | позже |
| POST | `/integrations/:id/sync` | Синхронизация с API брокера | позже |

---

## Формат ошибок

```json
{
  "statusCode": 400,
  "message": "Описание ошибки",
  "error": "Bad Request"
}
```

При ошибках валидации `message` — массив сообщений.

---

## Контракт транзакции (пример)

```json
{
  "id": "tx_1",
  "accountId": "acc_1",
  "assetId": "ast_1",
  "type": "buy",
  "date": "2026-09-01",
  "quantity": 10,
  "price": { "amount": 10000, "currency": "RUB" },
  "amount": { "amount": 100000, "currency": "RUB" },
  "fee": { "amount": 100, "currency": "RUB" },
  "tax": null,
  "source": "manual",
  "sourceId": null,
  "note": null
}
```

### Валидация продажи (подзадача 2.3)

При создании/обновлении `sell`-транзакции проверяется, что продаваемое количество ≤ доступных партий актива (по текущему кэшу `lots`); иначе `400 Bad Request` «Недостаточно партий для продажи». **Сознательное изменение поведения:** раньше продажа сверх остатка уводила позицию в минус. При обновлении sell списание самой обновляемой транзакции добавляется обратно к доступным партиям.

`TransactionDto` дополнен опциональным `realizedPnl` (`Money`) — реализованная прибыль продажи по FIFO (`выручка − списанная себестоимость`, выручка = `amount − fee − tax`).

## Snapshot-ввод (режим A) — `POST /accounts/:accountId/opening`

Принимает **одну дату начала ведения** и список текущих позиций. Каждая позиция конвертируется в `opening`-транзакцию (`type: opening`, флаг `opening` в сущности БД — в `TransactionDto` не отдаётся, `source: manual`, `amount = quantity × avgPrice`), после чего позиции счёта пересчитываются (AVCO = `avgPrice`).

```json
{
  "date": "2026-09-01",
  "items": [
    { "assetId": "ast_1", "quantity": 10, "avgPrice": { "amount": 10000, "currency": "RUB" } },
    { "assetId": "ast_2", "quantity": 2, "avgPrice": { "amount": 5000, "currency": "RUB" } }
  ]
}
```

Ответ — массив созданных `TransactionDto`. Валидация: актив должен существовать (иначе 404), `quantity > 0`, `avgPrice.amount ≥ 0`. Валюта `avgPrice` может отличаться от валюты счёта — сервер конвертирует mid-rate (ADR-009); нет курса → 400. `opening`-транзакции создают партии по введённому cost basis.

**Guard (идемпотентность):** snapshot-ввод разрешён только на **пустой счёт**. Если у счёта уже есть хотя бы одна транзакция любого типа (включая `opening`) → `409 Conflict` с сообщением «У счёта уже есть транзакции — snapshot-ввод запрещён». Для уже ведущегося счёта используйте ручной ввод транзакций (режим B).

## Доходы (income events) — `POST /income`

Создаёт income event (ADR-006). `netAmount` **не передаётся** — вычисляется на бэке: `net = gross − taxWithheld`. Все суммы — в валюте счёта.

```json
{
  "accountId": "acc_1",
  "assetId": "ast_1",
  "type": "dividend",
  "announcementDate": "2026-08-20",
  "exDate": "2026-08-28",
  "recordDate": "2026-08-30",
  "paymentDate": "2026-09-10",
  "grossAmount": { "amount": 10000, "currency": "RUB" },
  "taxWithheld": { "amount": 1300, "currency": "RUB" },
  "reinvested": false
}
```

Ответ — `IncomeEventDto` (в примере `netAmount = 8700`). Поведение:
- **Денежное зачисление** (по умолчанию) — создаётся связанная `income`-транзакция книги на фактически полученную сумму (`net`).
- **DRIP** (`reinvested: true`) — обязателен `reinvestPrice`; создаются `income` + `buy`-транзакции (`quantity = net / reinvestPrice`), позиции счёта пересчитываются.
- **`transactionId`** — связать событие с уже существующей транзакцией книги (новая `income`-транзакция не создаётся).
- **`distributed: true`** — только событие (PnL / статистика), без `income`-транзакции; кэш не меняется. Несовместимо с `reinvested` и `transactionId` (400). Типичный случай — доход в снапшоте «Добавить позиции».

Валидация: счёт принадлежит пользователю (404), актив существует (404), валюта сумм = валюта счёта (400), `gross ≥ taxWithheld` (400), `reinvestPrice` обязателен при DRIP (400).

### `GET /income`

Фильтры (query): `accountId?`, `assetId?`, `from?`/`to?` (по `paymentDate`). Возвращает только события пользователя (изоляция по `userId`).

### `GET /income/stats`

Агрегаты `gross`/`taxWithheld`/`net` по периодам (`byPeriod`, ключ `YYYY-MM`), активам (`byAsset`, ключ — id актива) и итоги по валютам (`totals`).

**`yieldPct`:** доходность `net / costBasis × 100` (2 знака) на **текущей** себестоимости позиции (`quantity × avgCostBasis`). В `byAsset` и `totals`; `null`, если позиции нет. В `byPeriod` нет (per-period yield — позже).

```json
{
  "totals": [
    { "key": "RUB", "count": 3, "gross": { "amount": 35000, "currency": "RUB" }, "taxWithheld": { "amount": 3900, "currency": "RUB" }, "net": { "amount": 31100, "currency": "RUB" }, "yieldPct": 12.5 }
  ],
  "byPeriod": [],
  "byAsset": []
}
```

## Типы и DTO

Общие типы (`Money`, enum'ы, DTO) живут в `packages/contracts/src/index.ts` и используются на фронте и бэке (ADR-001). Полный OpenAPI-спек будет сгенерирован из NestJS-контроллеров при необходимости.