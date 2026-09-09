# Auth

> Вход по email/паролю, короткоживущий access-токен и длинный refresh.

Модуль: `apps/api/src/modules/auth/`. Решение — [ADR-004](../decisions/ADR-004-auth.md).  
Маршруты — [контракт API](../api/contract.md).

## Суть

1. **Регистрация / вход** — пароль в bcrypt, ответ: access + refresh + user.
2. **Refresh** — по refresh-секрету выдаётся новая пара токенов.
3. **Guard** — на всех маршрутах кроме `/auth/*` и `/health`: Bearer access → `req.user`.

Данные чужих пользователей не отдаются: сервисы всегда фильтруют по `userId`.

## Как это работает на фронте

- Токены в localStorage (`store/auth.ts`).
- При **401** клиент один раз делает refresh и повторяет запрос (single-flight).
- **Проактивно** — refresh на ~80% жизни access (`apps/web/src/api/session.ts`).
- Провал refresh → очистка сессии → `/login`.

> Refresh сейчас **stateless** (не в БД). Logout и отзыв сессий — ещё не сделаны (в ADR заявлено шире).

## Где в коде

| Часть | Путь |
|---|---|
| Сервис / guard | `apps/api/src/modules/auth/` |
| Клиент / сессия | `apps/web/src/api/client.ts`, `apps/web/src/api/session.ts` |
| Стор | `apps/web/src/store/auth.ts` |

## См. также

- [Web-UI](web-ui.md)
- [Правила](../architecture/rules.md)
