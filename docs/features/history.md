# История стоимости

> График «как менялась стоимость» считается на лету из книги, без таблицы снапшотов.

Решение — [ADR-008](../decisions/ADR-008-history-valuation.md).  
Маршруты — [контракт API](../api/contract.md).

## Суть

На дату D: кэш + бумаги × цена (срез транзакций `date ≤ D`).  
Нет рыночной цены → берём себестоимость.  
Доходность периода — **Modified Dietz**.

На графике пунктир — **взносы** (deposit + opening − withdrawal), не AVCO «вложено».

Ограничение: без исторических котировок кривая рынка может быть «плоской» — видна в основном динамика денег.

## Как это работает в UI

| Вход | Как открывается |
|---|---|
| Дашборд (`portfolio.status`) | иконка → модалка `HistoryModal` (сводка + `PortfolioChart`) |
| Состав счёта | кнопка **История** → accordion `HistoryReveal` |

## Где в коде

| Часть | Путь |
|---|---|
| Калькулятор | `apps/api/src/modules/history/history-calculator.ts` |
| UI | `apps/web/src/dashboard/PortfolioChart.tsx` (`HistoryModal`, `HistoryReveal`, `PortfolioChart`) |

## См. также

- [Web-UI](web-ui.md)
- [Состав (взносы)](composition.md)
- [Позиции](positions.md)
