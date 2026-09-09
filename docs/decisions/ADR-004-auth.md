# ADR-004: Авторизация — JWT (access/refresh) + bcrypt

**Status:** Accepted (JWT + bcrypt готовы; sessions в БД / logout — позже)
**Date:** 2026-09-09
**Deciders:** Владелец проекта

## Context

Приложение — личные финансы с чувствительными данными. Нужна авторизация пользователей: регистрация, вход, защита API, изоляция данных по пользователю.

## Decision

Использовать **JWT**: короткоживущий access-токен + длинный refresh-токен с ротацией. Пароли хэшировать **bcrypt**.

## Options Considered

### Option A: JWT access/refresh — выбрано
| Dimension | Assessment |
|---|---|
| Complexity | Medium |
| Cost | Низкий |
| Scalability | Высокая (stateless) |
| Team familiarity | Высокая |

**Pros:** stateless, просто масштабировать; refresh с ротацией и отзывом; стандарт, много библиотек.
**Cons:** нужна аккуратная работа с refresh-токенами (ротация, хранение, отзыв); access-токен нельзя отозвать до истечения.

### Option B: Session + cookie
| Dimension | Assessment |
|---|---|
| Complexity | Medium |
| Cost | Низкий |
| Scalability | Средняя (stateful) |
| Team familiarity | Высокая |

**Pros:** простой отзыв сессий; cookie-флаги (HttpOnly, Secure).
**Cons:** stateful (нужно хранилище сессий), сложнее для SPA и мобильных клиентов.

### Option C: OAuth2/OpenID Connect (внешний IdP)
| Dimension | Assessment |
|---|---|
| Complexity | High |
| Cost | Средний |
| Scalability | Высокая |
| Team familiarity | Средняя |

**Pros:** готовый IdP, соц-вход.
**Cons:** избыточно для старта; внешняя зависимость; нужен свой IdP или провайдер.

## Trade-off Analysis

Для SPA с отдельным API JWT — естественный выбор: stateless, не требует хранилища сессий. Refresh-токены хранятся в БД (для отзыва/ротации). bcrypt — надёжное хэширование паролей. Session/cookie — альтернатива, если нужен простой отзыв; OAuth — позже, если понадобится соц-вход.

## Consequences

- Access-токен короткий (например, 15 мин), refresh — длинный (например, 30 дней) с ротацией.
- Refresh-токены хранятся в БД (таблица sessions) для отзыва.
- Все данные пользователя изолированы по `userId` в сервисах.
- Пароли — только bcrypt-хэш; никогда не логировать.

## Action Items
1. [x] Модуль auth: register/login/refresh (logout — [ ] не реализован).
2. [x] Guard для защиты маршрутов + изоляция по userId (`JwtAuthGuard`, `@CurrentUser`).
3. [ ] Таблица refresh-сессий (в текущей реализации refresh-токен stateless, в БД не хранится).
4. [x] Silent refresh на фронте: при 401 клиент обновляет пару токенов и повторяет запрос; proactive refresh на 80% TTL access (см. `apps/web/src/api/client.ts`, `apps/web/src/api/session.ts`).

> **Примечание:** реализация (фаза 1) включает register/login/refresh, `JwtAuthGuard` и изоляцию по `userId`. `logout` и хранение refresh-сессий в БД (для ротации/отзыва) — открытые пункты. Подробности — [docs/features/auth](../features/auth.md).