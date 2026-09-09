# Web-UI

> Узкий «банковский» экран: дашборд, состав счёта, формы ввода.

Приложение: `apps/web/` (React 18, Vite, Tailwind, TanStack Query, Zustand).

## Суть

| Маршрут | Страница |
|---|---|
| `/` | лендинг (или редирект на дашборд) |
| `/login` | вход / регистрация |
| `/dashboard` | портфель (нужен токен) |

Стиль: тёмная HUD-панель, центрированная колонка, mobile-first.

## Как это работает

- **Сессия** — access + refresh в localStorage; silent и proactive refresh ([auth](auth.md)).
- **Display currency** — `store/display-currency.ts` → `GET /portfolio?displayCurrency=`.
- **Деньги** — `lib/money.ts`: decimal ⇄ минимальные единицы, precision по типу актива/счёта.
- **Дашборд** — карточка `portfolio.status`: крупная сумма, badge **% за день**, полоса **allocation** по типам активов (`GET /portfolio.allocation`); детали и полный график — по иконке (`HistoryModal`). Карточки счетов в своей валюте.
- **Состав** — весь учёт по счёту → [composition.md](composition.md); модалка шире (`max-w-5xl`), таблица позиций двухстрочная (имя/тикер, вложено, стоимость, прибыль %, день, доля); история счёта — accordion `HistoryReveal`.

Формы: транзакция, снапшот (с опциональным доходом по строке), доход; выбор актива через поиск (без ручного создания).

## Где в коде

| Часть | Путь |
|---|---|
| Страницы | `pages/DashboardPage.tsx`, `LoginPage.tsx`, `LandingPage.tsx` |
| Хаб | `dashboard/CompositionModal.tsx` |
| История UI | `dashboard/PortfolioChart.tsx` (`HistoryModal`, `HistoryReveal`) |
| Клиент | `apps/web/src/api/client.ts`, `apps/web/src/api/session.ts` |

## См. также

- [Состав](composition.md)
- [История](history.md)
- [Auth](auth.md)
- [Цены](prices.md)
