# Контракт API

REST API, JSON. Все маршруты, кроме `/auth/*`, требуют авторизации (Bearer access-токен). Базовый префикс: `/api/v1`.

## Аутентификация

| Метод | Путь | Описание |
|---|---|---|
| POST | `/auth/register` | Регистрация (`email`, `password`, `name`) |
| POST | `/auth/login` | Вход → `{ accessToken, refreshToken }` |
| POST | `/auth/refresh` | Обновление access-токена |
| POST | `/auth/logout` | Отзыв refresh-токена |

## Счета

| Метод | Путь | Описание |
|---|---|---|
| GET | `/accounts` | Список счетов |
| POST | `/accounts` | Создать счёт |
| GET | `/accounts/:id` | Счёт с позициями |
| PATCH | `/accounts/:id` | Обновить счёт |
| DELETE | `/accounts/:id` | Удалить счёт |

## Активы (справочник)

| Метод | Путь | Описание |
|---|---|---|
| GET | `/assets` | Поиск активов (по символу/названию) |
| GET | `/assets/:id` | Актив + текущая цена |

## Транзакции (единая книга)

| Метод | Путь | Описание |
|---|---|---|
| GET | `/accounts/:id/transactions` | Список транзакций счёта |
| POST | `/accounts/:id/transactions` | Создать транзакцию (buy/sell/dividend/...) |
| PATCH | `/transactions/:id` | Обновить транзакцию |
| DELETE | `/transactions/:id` | Удалить транзакцию |
| POST | `/accounts/:id/opening` | Snapshot-ввод → opening-транзакции (сценарий A) |

## Позиции (производные)

| Метод | Путь | Описание |
|---|---|---|
| GET | `/accounts/:id/positions` | Позиции счёта с текущей стоимостью |
| GET | `/portfolio` | Сводка по всем счетам (стоимость, доходность) |

## Доходы (income events)

| Метод | Путь | Описание |
|---|---|---|
| GET | `/income` | Список доходов (дивиденды/купоны) |
| GET | `/income/stats` | Статистика доходности |

## Расходы и бюджеты

| Метод | Путь | Описание |
|---|---|---|
| GET | `/expenses` | Список расходов |
| POST | `/expenses` | Создать расход |
| GET | `/categories` | Справочник категорий |
| GET | `/budgets` | Бюджеты |
| POST | `/budgets` | Создать бюджет |

## Импорт (авто-режим)

| Метод | Путь | Описание |
|---|---|---|
| POST | `/import` | Загрузить отчёт (multipart: CSV/XML) → предпросмотр |
| GET | `/import/:batchId` | Статус и строки импорта |
| POST | `/import/:batchId/confirm` | Подтвердить импорт в книгу |
| GET | `/integrations` | Список брокерских интеграций |
| POST | `/integrations/:id/sync` | Запустить синхронизацию с API брокера |

## Формат ошибок

```json
{
  "statusCode": 400,
  "message": "Описание ошибки",
  "error": "Bad Request"
}
```

## Деньги и валюты

- Все суммы — **целые числа в минимальных единицах** + `currency` (ISO 4217). Пример: `{ "amount": 12345, "currency": "RUB" }` = 123.45 ₽.
- Никогда не передавать `float` для денег.

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

## Примечания

- Полный OpenAPI-спек будет сгенерирован из NestJS-контроллеров при реализации.
- Общие DTO живут в `packages/contracts` (см. ADR-001) и используются на фронте и бэке.