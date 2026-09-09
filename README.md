# FinFury

Личное финансовое приложение: учёт инвестиционных портфелей (акции, облигации, крипто), доходов (дивиденды/купоны), расходов и других полезных фич для личных финансов.

Современный «узкий» интерфейс в стиле банковского приложения, авторизация пользователей, отдельный бэкенд с API и БД.

> **Статус:** скелет монорепо развёрнут (React + NestJS + PostgreSQL). Реализованы auth (JWT), health-эндпоинт, PriceProvider-каркас. Дальше — по [дорожной карте](docs/roadmap.md).

## Возможности (целевые)

- Учёт портфелей: акции, облигации, фонды, крипто, кэш.
- **Два режима ведения:**
  - **Ручной** — два сценария:
    - *Существующий портфель:* ввод текущих позиций и cost basis (без воспроизведения всей истории сделок).
    - *Новый/небольшой портфель:* полный учёт транзакций (покупки/продажи).
  - **Автоматический** — интеграции с API брокеров и/или парсинг выгруженных отчётов (CSV/XML).
- Учёт дивидендов, купонов и прочих корпоративных действий.
- Автоматическая оценка стоимости активов из внешних источников цен.
- Учёт расходов и бюджетирование.
- Авторизация пользователей.

## Структура репозитория

```
docs/
  architecture/
    overview.md          # системная архитектура и стек
    domain-model.md      # доменная модель и ER-диаграмма
    data-entry-modes.md  # режимы ввода данных (ручной/авто)
  decisions/             # ADR — решения по архитектуре
    ADR-001-tech-stack.md
    ADR-002-database.md
    ADR-003-transaction-ledger.md
    ADR-004-auth.md
    ADR-005-price-provider.md
    ADR-006-income-events.md
  api/
    contract.md          # контракт API (ресурсы, аутентификация)
  roadmap.md             # MVP и этапы реализации
```

## Быстрый старт

Требования: Node.js ≥ 20, pnpm ≥ 9, Docker (для БД).

```bash
# 1. Установить зависимости
pnpm install

# 2. Создать .env из примера (секреты — только локально)
cp .env.example .env

# 3. Запустить PostgreSQL
pnpm db:up

# 4. Запустить всё (API + web)
pnpm dev

# Отдельно:
pnpm dev:api   # API на http://localhost:3000/api/v1
pnpm dev:web   # Web на http://localhost:5173
```

Проверка API: `curl http://localhost:3000/api/v1/health`.

## Команды

| Команда | Описание |
|---|---|
| `pnpm dev` | Запустить API и web (turbo) |
| `pnpm build` | Собрать все пакеты |
| `pnpm typecheck` | Проверка типов во всех пакетах |
| `pnpm test` | Тесты (пока нет) |
| `pnpm db:up` | Поднять PostgreSQL (docker compose) |
| `pnpm db:down` | Остановить PostgreSQL |

## Ключевые решения (кратко)

| Решение | Выбор | ADR |
|---|---|---|
| Стек | TypeScript-монорепо: React + NestJS | [ADR-001](docs/decisions/ADR-001-tech-stack.md) |
| БД | PostgreSQL + Prisma | [ADR-002](docs/decisions/ADR-002-database.md) |
| Учёт позиций | Единая транзакционная книга (snapshot → opening-транзакция) | [ADR-003](docs/decisions/ADR-003-transaction-ledger.md) |
| Авторизация | JWT access/refresh, bcrypt | [ADR-004](docs/decisions/ADR-004-auth.md) |
| Оценка активов | Абстракция PriceProvider с адаптерами и кэшем | [ADR-005](docs/decisions/ADR-005-price-provider.md) |
| Дивиденды/купоны | Доходные события (income events) | [ADR-006](docs/decisions/ADR-006-income-events.md) |

## Документация

- [Системная архитектура](docs/architecture/overview.md)
- [Доменная модель](docs/architecture/domain-model.md)
- [Режимы ввода данных](docs/architecture/data-entry-modes.md)
- [Контракт API](docs/api/contract.md)
- [Дорожная карта](docs/roadmap.md)