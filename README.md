# FinFury

> Личный учёт инвестиций: ввёл сделки — видишь портфель и стоимость.

Узкий UI в духе банковского приложения. Бэкенд — REST API + PostgreSQL.

Полная карта документации → **[docs/README.md](docs/README.md)**.

## Быстрый старт

Нужны: Node.js ≥ 20, pnpm ≥ 9, Docker.

```bash
pnpm install
cp .env.example .env
pnpm db:up
pnpm dev
```

- API: http://localhost:3000/api/v1 (`/health` для проверки)
- Web: http://localhost:5173

## Команды

| Команда | Что делает |
|---|---|
| `pnpm dev` | API + web |
| `pnpm dev:api` / `pnpm dev:web` | По отдельности |
| `pnpm test` | Юнит-тесты |
| `pnpm typecheck` / `pnpm build` | Типы / сборка |
| `pnpm db:up` / `pnpm db:down` | PostgreSQL |

## Стек

| Слой | Технология |
|---|---|
| Монорепо | pnpm + Turborepo |
| Web | React 18, Vite, Tailwind, TanStack Query, Zustand |
| API | NestJS 10, TypeORM |
| БД | PostgreSQL 16 |
| Auth | JWT + bcrypt |

Почему так — [ADR](docs/decisions/README.md).

## Репозиторий

```
apps/api          NestJS (модули auth, accounts, assets, transactions, positions, lots, income, history, prices)
apps/web          React SPA
packages/contracts  Общие DTO/типы
docs/             Карта, архитектура, функции, API, ADR
```

## Переменные окружения

| Переменная | Назначение |
|---|---|
| `DATABASE_URL` | PostgreSQL |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Подпись токенов |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | TTL (по умолчанию `15m` / `30d`) |
| `PORT` | API (по умолчанию `3000`) |
| `CORS_ORIGIN` | Origin'ы через запятую |
| `VITE_API_URL` | URL API для web |

Секреты только в `.env`, не в коде.
