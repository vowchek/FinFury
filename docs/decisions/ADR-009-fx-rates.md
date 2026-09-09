# ADR-009: FX-курсы и валюта отображения портфеля

- **Статус:** ✅ Accepted
- **Дата:** 2026-03-15
- **Контекст задачи:** фаза 4, подзадача 4.2 «Мультивалютные портфели и FX-пересчёт»
- **Связано:** [ADR-005](ADR-005-price-provider.md) (PriceProvider), [ADR-002](ADR-002-database.md) (деньги в minors)

## Контекст и проблема

Счета могут быть в разных валютах и с разным scale minors (брокер RUB ×100, WALLET USD ×1 000 000). Складывать minors без FX нельзя — получается баг «10 000 $ как 103 M ₽». Нужна явная конвертация в **валюту отображения** на дашборде, при этом внутри счёта остаются: сводка в `account.currency`, строки — в валюте котировки актива (крипта — USD).

## Рассмотренные варианты

1. **Конвертация на клиенте** по сырым `totals[]` + отдельный эндпоинт курсов. Плюс: простой бэк. Минусы: риск ошибки scale на UI; дублирование логики; расхождение с серверными отчётами.
2. **Таблица `fx_rates` + актив типа `fx`** как единственный источник. Плюс: явный доменный объект. Минусы: нужна запись курсов (ручная/фоновая) до того, как сводка заработает; оверинжиниринг для MVP.
3. **`FxRateProvider` рядом с PriceProvider** + конвертация на бэке в `GET /portfolio?displayCurrency=` — выбрано.

## Решение

### Источник курса (MVP)
- **Frankfurter** (ECB mid-rate, без ключа): пары без RUB (`USD`/`EUR` и т.п.).
- **CBR** (`cbr-xml-daily.ru/daily_json.js`): пары с **RUB** (ECB с 2022 не публикует рубль).
- Порядок в `PriceService`: CBR → Frankfurter (fallback-цепочка).
- Mid-rate (не bid/ask): для оценки портфеля достаточно; спред FX не моделируем.
- Выходные / праздники: оба источника отдают **последний торговый день** — кэшируем как есть, не падаем.
- Пары MVP: `RUB`, `USD`, `EUR`. Остальные → 400.
- Fallback в тестах: `StubFxRateProvider` с фиксированными курсами.

### Кэш
- In-memory, ключ `from:to`, TTL **15 мин** (как текущие цены).
- Инверсия: при запросе `to→from` используем `1/rate` того же кэша (с осторожным пересчётом), либо отдельный запрос к API.

### Точность денег
- Деньги всегда целые minors (ADR-002).
- Конвертация: `convertMoney(amount, fromPrec, toPrec, rate)` через **BigInt** и rate с фиксированным scale (1e9), half-up.
- Валюта отображения на дашборде: **precision 2** (копейки/центы), даже если исходный WALLET хранит USD ×10⁶ — иначе снова смешение scale в UI.
- Одинаковая валюта, разный precision (USD p6 → USD p2): `rate = 1`, только смена scale.

### Слои валют (не путать)
| Слой | Где | Валюта |
|---|---|---|
| Display | `portfolio.status` | `?displayCurrency` (дефолт `User.baseCurrency`) |
| Account | `accounts.list`, сводка «Состав» | `account.currency` (без FX от переключателя) |
| Asset / quote | цены в таблице; ввод цены сделки | валюта актива; при записи → FX в валюту счёта |

### API
- `GET /portfolio?displayCurrency=USD|RUB|EUR`:
  - корневые `total*` — **одна** сводка в display currency;
  - `accounts[]` — **всегда** в валюте счёта (FX переключателя на list не действует);
  - `totals[]` — нативные бакеты `(currency, precision)` для отладки / одно-валютного режима;
  - `displayCurrency` + `displayPrecision` в ответе.
- Без `displayCurrency`: поведение как раньше (`totals[]`, legacy `total*` = `totals[0]`).
- Запись сделок/opening: цена в валюте актива → FX в валюту счёта (`TransactionsService.toAccountMoney`).
- WALLET: create/update только с `currency = USD` (API + UI).

### Вне объёма
- Исторический FX для `GET /history` (графики остаются в валюте счёта / current FX — отдельно).
- Разложение P&L на asset vs FX.
- Полный справочник мировых валют.

## Последствия

- Плюсы: одна цифра на дашборде; нет смешения scale; тестируемый провайдер; стыковка с ADR-005.
- Минусы: mid-rate ≠ курс брокера при реальной конвертации; выходной курс «вчерашний»; история графиков без historical FX остаётся условной при мультивалютности.
- Action items закрыты реализацией в `apps/api/src/prices/fx-*`, `portfolio.service`, web display-currency store.

## Action Items
1. [x] ADR-009 (этот документ).
2. [x] `FxRateProvider` + кэш + CBR (RUB) + Frankfurter + stub.
3. [x] `convertMoney` (BigInt) + тесты scale 2↔6.
4. [x] `GET /portfolio?displayCurrency=` и WALLET=USD.
5. [x] UI: переключатель + persistence; Composition в account currency.
6. [x] Docs: prices, positions, web-ui, contract, ADR-005 action item FX.
