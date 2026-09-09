# ADR — архитектурные решения

> Зачем выбрали так, а не иначе. Основная карта продукта — [docs/README](../README.md).

## Как читать

- **Accepted** — действует; **Superseded** — заменено новым ADR (старый не удаляем).
- Реализация «как сейчас» — в [features](../features/README.md).

## Индекс

| Тема | Решение | ADR | Статус |
|---|---|---|---|
| Стек | TypeScript-монорепо: React + NestJS | [ADR-001](ADR-001-tech-stack.md) | Accepted |
| БД | PostgreSQL | [ADR-002](ADR-002-database.md) | Superseded ORM → 007 |
| Книга | Позиции из транзакций; снапшот → opening | [ADR-003](ADR-003-transaction-ledger.md) | Accepted |
| Auth | JWT access/refresh + bcrypt | [ADR-004](ADR-004-auth.md) | Accepted |
| Цены | PriceProvider + адаптеры + кэш | [ADR-005](ADR-005-price-provider.md) | Accepted |
| Доходы | Income events | [ADR-006](ADR-006-income-events.md) | Accepted |
| ORM | TypeORM | [ADR-007](ADR-007-database-orm-typeorm.md) | Accepted |
| Графики | История на лету от книги | [ADR-008](ADR-008-history-valuation.md) | Accepted |
| FX | CBR + Frankfurter, `displayCurrency` | [ADR-009](ADR-009-fx-rates.md) | Accepted |

## См. также

- [Правила учёта](../architecture/rules.md)
- [Архитектура](../architecture/README.md)
