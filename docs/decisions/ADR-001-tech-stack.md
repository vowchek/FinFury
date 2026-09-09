# ADR-001: Технологический стек — TypeScript-монорепо (React + NestJS)

**Status:** Accepted
**Date:** 2026-09-09
**Deciders:** Владелец проекта

## Context

Нужен стек для личного финансового приложения: SPA-фронтенд с «узким» банковским UI, отдельный бэкенд с REST API, БД. Требования: современный дизайн, авторизация, интеграции с внешними источниками цен и брокерами, мультивалютность, точный учёт (cost basis, доходы). Проект ведётся одним разработчиком/малой командой.

## Decision

Использовать **TypeScript-монорепо**: React + Vite + Tailwind CSS на фронте, NestJS на бэкенде, общие типы/контракты между ними.

## Options Considered

### Option A: TypeScript full-stack (React + NestJS) — выбрано
| Dimension | Assessment |
|---|---|
| Complexity | Medium |
| Cost | Низкий (всё open-source) |
| Scalability | Достаточно для личного приложения |
| Team familiarity | Один язык на всём стеке |

**Pros:** один язык и типы на фронте и бэке (общие DTO); быстро; большой экосистемный выбор; NestJS даёт структуру/DI для сложного домена.
**Cons:** NestJS тяжелее лёгких фреймворков; TS-типизация внешних API требует усилий.

### Option B: Python (FastAPI) + React
| Dimension | Assessment |
|---|---|
| Complexity | Medium |
| Cost | Низкий |
| Scalability | Достаточно |
| Team familiarity | Два языка |

**Pros:** FastAPI прост, хорош для API; Python удобен для парсинга отчётов.
**Cons:** два языка, нет общего типа между фронтом и бэком; дублирование контрактов.

### Option C: Go (backend) + React
| Dimension | Assessment |
|---|---|
| Complexity | High |
| Cost | Низкий |
| Scalability | Высокая |
| Team familiarity | Низкая |

**Pros:** производительность, надёжность.
**Cons:** избыточно для личного приложения; медленнее разработка; нет общего типа с фронтом.

## Trade-off Analysis

Для личного fintech-приложения главный приоритет — скорость разработки и целостность контрактов. TypeScript full-stack даёт общие типы (контракты API), что критично для стыковки фронта/бэка/БД. NestJS обеспечивает структуру для сложного домена (ledger, income events, price provider). Python/Go выигрывают в отдельных аспектах, но проигрывают по целостности контрактов и скорости.

## Consequences

- Один язык и общая система типов на всём стеке.
- Общие пакеты в монорепо (DTO, валидация).
- Команда должна знать NestJS и React (стандартные навыки).
- Возможна миграция отдельных модулей (например, парсинг отчётов) на другой язык без смены стека в целом.

## Action Items
1. [x] Создать монорепо (pnpm workspaces + turborepo).
2. [x] Развернуть скелеты `apps/web` (Vite) и `apps/api` (NestJS).
3. [x] Выделить общий пакет `packages/contracts` для DTO.