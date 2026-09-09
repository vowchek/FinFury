# ADR-007: ORM — TypeORM (замена Prisma из ADR-002)

**Status:** Accepted
**Date:** 2026-09-09
**Deciders:** Владелец проекта

## Context

ADR-002 зафиксировал **Prisma** как ORM, но код с самого начала работает на **TypeORM**:

- `apps/api/src/modules/auth/user.entity.ts` использует `@Entity`/`@Column` из `typeorm`.
- `apps/api/src/app.module.ts` — `TypeOrmModule.forRootAsync`.
- `apps/api/src/modules/auth/auth.module.ts` — `TypeOrmModule.forFeature([User])`.
- В зависимостях `apps/api/package.json`: `@nestjs/typeorm`, `typeorm`, `pg`.
- Prisma нигде не установлен (нет в `package.json`/`pnpm-lock.yaml`).

Возникло противоречие между документом (Prisma) и кодом (TypeORM). Решение нужно зафиксировать **до** построения схемы БД (TASK-1), иначе агенты разойдутся: кто-то будет писать Prisma-схему, кто-то — TypeORM-сущности.

## Decision

Использовать **PostgreSQL** как основную БД (без изменений из ADR-002) и **TypeORM** как ORM. Решение об ORM из ADR-002 (Prisma) **заменяется** на TypeORM.

## Options Considered

### Option A: TypeORM — выбрано
| Dimension | Assessment |
|---|---|
| Complexity | Low (уже используется и работает) |
| Cost | Низкий (open-source) |
| Scalability | Достаточно для личного приложения |
| Team familiarity | Высокая (код уже на нём) |

**Pros:** уже внедрён и работает (Auth/User); нативная интеграция `@nestjs/typeorm` (DI, `forFeature`, `autoLoadEntities`); декораторы-сущности удобны для доменной модели; миграции через `typeorm migration`; активная экосистема.
**Cons:** менее «магическая» типизация, чем у Prisma; для сложных агрегаций нужен raw SQL/QueryBuilder.

### Option B: Prisma (из ADR-002)
| Dimension | Assessment |
|---|---|
| Complexity | Medium (нужно внедрять с нуля) |
| Cost | Низкий |
| Scalability | Достаточно |
| Team familiarity | Низкая (в коде не используется) |

**Pros:** типобезопасный клиент, удобные миграции.
**Cons:** не установлен; потребуется переписать существующий Auth-модуль; дублирование усилий до построения схемы; генерация клиента добавляет шаг в сборку.

### Option C: Другой ORM (Drizzle, Knex, raw SQL)
| Dimension | Assessment |
|---|---|
| Complexity | High (миграция с нуля) |
| Cost | Низкий |
| Scalability | Достаточно |
| Team familiarity | Низкая |

**Pros:** современные альтернативы (например, Drizzle) с хорошей типизацией.
**Cons:** нет причин менять работающий стек; дополнительный риск и время.

## Trade-off Analysis

Главный критерий — **устранить противоречие с минимальными усилиями и риском**. TypeORM уже используется, работает и покрывает потребности (Auth/User). Переход на Prisma или другой ORM потребовал бы переписать существующий код и добавил бы работу до построения схемы БД. Выгоды Prisma (типизация) не оправдывают затрат на миграцию на этом этапе. PostgreSQL остаётся неизменным решением из ADR-002.

## Consequences

- **PostgreSQL** — основная БД (без изменений).
- **TypeORM** — единственный ORM; Prisma не используется и не устанавливается.
- Схема БД (TASK-1) строится на TypeORM-сущностях, регистрируется через `autoLoadEntities`.
- Миграции — через `typeorm migration` (в production), `synchronize` — только в dev.
- Деньги — целые числа в минимальных единицах + `currency` (без изменений, ADR-002).

## Action Items

1. [x] Зафиксировать TypeORM как ORM (этот ADR).
2. [x] Актуализировать документацию (README, AGENTS.md, overview.md, ADR-002).
3. [x] Схема БД на TypeORM-сущностях (TASK-1): `Account`, `Asset`, `Transaction`, `Position`.
