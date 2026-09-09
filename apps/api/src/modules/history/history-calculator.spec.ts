import { describe, expect, it } from 'vitest';
import { HistoryInterval, TransactionType } from '@finfury/contracts';
import {
  buildBuckets,
  dietz,
  netFlowIn,
  toIsoDate,
  toUtcMs,
  valueAt,
  type HistoryTxInput,
} from './history-calculator';

const PRICE = { amount: 10_000 };

function tx(partial: Partial<HistoryTxInput>): HistoryTxInput {
  return {
    date: '2026-01-01',
    type: TransactionType.BUY,
    assetId: 'a1',
    quantity: 10,
    priceMinors: 10_000,
    amountMinors: 100_000,
    feeMinors: null,
    taxMinors: null,
    ...partial,
  };
}

/** Депозит на покрытие покупки (иначе кэш уходит в минус). */
function deposit(amount = 200_000, date = '2026-01-01'): HistoryTxInput {
  return tx({
    date,
    type: TransactionType.DEPOSIT,
    assetId: null,
    quantity: null,
    priceMinors: null,
    amountMinors: amount,
  });
}

describe('valueAt', () => {
  it('пустая книга → нули', () => {
    const v = valueAt([], '2026-01-01', () => PRICE);
    expect(v).toEqual({
      valueMinors: 0,
      investedMinors: 0,
      contributionsMinors: 0,
      cashMinors: 0,
      priceSource: 'current',
    });
  });

  it('opening-транзакция считается как позиция (кэш не двигает)', () => {
    const v = valueAt([tx({ type: TransactionType.OPENING })], '2026-06-01', () => PRICE);
    expect(v.valueMinors).toBe(100_000);
    expect(v.investedMinors).toBe(100_000);
    expect(v.contributionsMinors).toBe(100_000);
    expect(v.cashMinors).toBe(0);
    expect(v.priceSource).toBe('current');
  });

  it('buy двигает кэш вниз, стоимость = позиции + кэш', () => {
    const v = valueAt([deposit(), tx({})], '2026-06-01', () => PRICE);
    expect(v.cashMinors).toBe(100_000); // 200k депозит − 100k покупка
    expect(v.investedMinors).toBe(100_000);
    expect(v.contributionsMinors).toBe(200_000);
    expect(v.valueMinors).toBe(200_000);
  });

  it('sell уменьшает позицию и двигает кэш вверх', () => {
    const v = valueAt(
      [
        deposit(),
        tx({}),
        tx({ type: TransactionType.SELL, quantity: 4, amountMinors: 40_000, priceMinors: 10_000 }),
      ],
      '2026-06-01',
      () => PRICE,
    );
    expect(v.investedMinors).toBe(60_000); // 6 × 10_000
    expect(v.cashMinors).toBe(140_000); // 200k − 100k + 40k
    expect(v.valueMinors).toBe(200_000);
  });

  it('дробные количества считаются точно', () => {
    const v = valueAt([tx({ type: TransactionType.OPENING, quantity: 0.123456 })], '2026-06-01', () => PRICE);
    expect(v.investedMinors).toBe(Math.round(0.123456 * 10_000));
  });

  it('нет цены → оценка по себестоимости, priceSource = cost', () => {
    const v = valueAt([tx({ type: TransactionType.OPENING })], '2026-06-01', () => undefined);
    expect(v.valueMinors).toBe(100_000);
    expect(v.investedMinors).toBe(100_000);
    expect(v.contributionsMinors).toBe(100_000);
    expect(v.cashMinors).toBe(0);
    expect(v.priceSource).toBe('cost');
  });

  it('DRIP (income + buy на одну сумму) не меняет стоимость', () => {
    const v = valueAt(
      [
        deposit(),
        tx({}),
        tx({
          type: TransactionType.INCOME,
          assetId: null,
          quantity: null,
          priceMinors: null,
          amountMinors: 5_000,
        }),
        tx({ quantity: 0.5, amountMinors: 5_000 }),
      ],
      '2026-06-01',
      () => PRICE,
    );
    expect(v.cashMinors).toBe(100_000); // депозит − buy − drip buy + income
    expect(v.investedMinors).toBe(105_000); // 10 + 0.5 шт × 10_000
    expect(v.contributionsMinors).toBe(200_000); // только депозит; income не в взносах
    expect(v.valueMinors).toBe(205_000);
  });

  it('withdrawal уменьшает взносы', () => {
    const v = valueAt(
      [
        deposit(100_000),
        tx({
          type: TransactionType.WITHDRAWAL,
          assetId: null,
          quantity: null,
          priceMinors: null,
          amountMinors: 30_000,
        }),
      ],
      '2026-06-01',
      () => PRICE,
    );
    expect(v.contributionsMinors).toBe(70_000);
    expect(v.cashMinors).toBe(70_000);
    expect(v.valueMinors).toBe(70_000);
  });

  it('точка до транзакций → нули, после — полная стоимость', () => {
    const txs = [deposit(50_000, '2026-03-10')];
    expect(valueAt(txs, '2026-03-09', () => PRICE).valueMinors).toBe(0);
    expect(valueAt(txs, '2026-03-10', () => PRICE).valueMinors).toBe(50_000);
    expect(valueAt(txs, '2026-03-11', () => PRICE).valueMinors).toBe(50_000);
  });
});

describe('buildBuckets', () => {
  it('day: по одной точке на день, последняя всегда to', () => {
    const { ends, interval } = buildBuckets('2026-01-01', '2026-01-03', HistoryInterval.DAY);
    expect(interval).toBe(HistoryInterval.DAY);
    expect(ends).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
  });

  it('month: концы месяцев + последняя точка to', () => {
    const { ends, interval } = buildBuckets('2026-01-15', '2026-03-05', HistoryInterval.MONTH);
    expect(interval).toBe(HistoryInterval.MONTH);
    expect(ends).toEqual(['2026-01-31', '2026-02-28', '2026-03-05']);
  });

  it('week: ближайшее воскресенье ≥ from', () => {
    const { ends } = buildBuckets('2026-01-01', '2026-01-21', HistoryInterval.WEEK); // 2026-01-01 — четверг
    expect(ends[0]).toBe('2026-01-04');
  });

  it('слишком много бакетов → интервал повышается', () => {
    const { interval } = buildBuckets('2020-01-01', '2026-01-01', HistoryInterval.DAY);
    expect(interval).not.toBe(HistoryInterval.DAY);
  });

  it('to < from → пустой список', () => {
    expect(buildBuckets('2026-02-01', '2026-01-01', HistoryInterval.DAY).ends).toEqual([]);
  });
});

describe('netFlowIn', () => {
  it('считает движение денег за период [from, to]', () => {
    const txs = [
      deposit(10_000, '2026-01-01'),
      deposit(5_000, '2026-01-10'),
      tx({
        date: '2026-01-20',
        type: TransactionType.WITHDRAWAL,
        assetId: null,
        quantity: null,
        priceMinors: null,
        amountMinors: 2_000,
      }),
      deposit(999, '2026-02-01'),
    ];
    expect(netFlowIn(txs, '2026-01-01', '2026-01-31')).toBe(13_000);
    expect(netFlowIn(txs, '2026-01-02', '2026-01-31')).toBe(3_000); // 1-е не входит
  });
});

describe('dietz', () => {
  it('без движения денег: (end − start) / start', () => {
    const r = dietz(100_000, 110_000, [], '2026-01-01', '2026-02-01');
    expect(r.pnl).toBe(10_000);
    expect(r.returnPct).toBe(10);
  });

  it('ввод в середине периода не считается доходностью', () => {
    // 100k старт; +100k ввод в середине; конец 200k → pnl = 0
    const r = dietz(100_000, 200_000, [{ date: '2026-01-16', amount: 100_000 }], '2026-01-01', '2026-01-31');
    expect(r.pnl).toBe(0);
    expect(r.returnPct).toBe(0);
  });

  it('вывод увеличивает pnl', () => {
    // 100k старт; −10k вывод; конец 95k → pnl = 95 − (100 − 10) = 5
    const r = dietz(100_000, 95_000, [{ date: '2026-01-16', amount: -10_000 }], '2026-01-01', '2026-01-31');
    expect(r.pnl).toBe(5_000);
    expect(r.returnPct).not.toBeNull();
  });

  it('нулевая база → returnPct null', () => {
    const r = dietz(0, 0, [], '2026-01-01', '2026-01-31');
    expect(r.pnl).toBe(0);
    expect(r.returnPct).toBeNull();
  });

  it('вырожденный период → null', () => {
    const r = dietz(100_000, 100_000, [], '2026-01-01', '2026-01-01');
    expect(r.returnPct).toBeNull();
  });

  it('согласован с правилами кэша: flow-даты вне периода клампятся', () => {
    const r = dietz(100_000, 110_000, [{ date: '2025-12-01', amount: 1_000 }], '2026-01-01', '2026-01-31');
    // flow до старта — вес 1 (работал весь период)
    expect(r.pnl).toBe(9_000);
  });
});

describe('toUtcMs/toIsoDate', () => {
  it('круговая конвертация в UTC', () => {
    expect(toIsoDate(toUtcMs('2026-03-05'))).toBe('2026-03-05');
  });
});
