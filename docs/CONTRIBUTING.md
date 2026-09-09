# Как обновлять документацию

> После любой задачи docs должны совпадать с кодом. Этот файл — источник правил; скилл `update-docs` повторяет чек-лист.

## Что трогать

| Документ | Когда |
|---|---|
| [features/*.md](features/README.md) | Изменилась логика модуля |
| [api/contract.md](api/contract.md) | Маршруты, поля, статусы |
| [architecture/domain-model.md](architecture/domain-model.md) | Сущности / деньги / связи |
| [architecture/rules.md](architecture/rules.md) | Новое сквозное правило учёта |
| [architecture/overview.md](architecture/overview.md) | Картинка системы / поток |
| [architecture/data-entry-modes.md](architecture/data-entry-modes.md) | Способы ввода |
| [decisions/ADR-*.md](decisions/README.md) | Решение реализовано или изменилось |
| [README.md](../README.md), [docs/README.md](README.md) | Запуск, карта, структура |

## ADR

- Реализовано → статус `Accepted` / пометка «готово», action items `[x]`.
- Решение **изменилось** → **новый** ADR, старый `Superseded` (историю не стираем).
- Не доделано → честно «позже» / открытые пункты.

## Стиль страниц

Единый шаблон:

1. `# Заголовок`
2. `> Lead` — одна фраза
3. `## Суть` → `## Как это работает` (по необходимости) → `## Где в коде` → `## См. также`

Один факт — в одном месте. Принципы учёта только в [rules.md](architecture/rules.md). Маршруты API — только в [contract.md](api/contract.md).

## Структура

```
docs/
├── README.md           # карта
├── CONTRIBUTING.md     # этот файл
├── architecture/       # правила, overview, модель, ввод
├── features/           # логика модулей
├── api/                # контракт
└── decisions/          # ADR
```

## Перед сдачей

- [ ] Код и docs не расходятся
- [ ] Ссылки живые
- [ ] Нет копипасты правил / эндпоинтов по файлам
