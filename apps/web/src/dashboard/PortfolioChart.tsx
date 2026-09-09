import { useId, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { HistoryInterval, Money, PortfolioHistoryDto } from '@finfury/contracts';
import { get } from '../api/client';
import { Modal } from '../components/Modal';
import {
  formatMoney,
  formatMinorUnits,
  formatPercent,
  formatSignedMoney,
  formatYieldPct,
} from '../lib/money';

/**
 * График стоимости портфеля/счёта (фаза 2, 2.4; ADR-008).
 * Дашборд: иконка → HistoryModal; состав счёта: HistoryReveal.
 * SVG без чарт-библиотеки.
 */

const PERIODS: { key: string; label: string; days: number | null }[] = [
  { key: '1m', label: '1М', days: 30 },
  { key: '3m', label: '3М', days: 91 },
  { key: '6m', label: '6М', days: 183 },
  { key: '1y', label: '1Г', days: 365 },
  { key: 'all', label: 'Всё', days: null },
];

const W = 640;
const H = 200;
const PAD = { top: 12, right: 8, bottom: 20, left: 8 };

function shiftDate(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function linePath(values: number[], min: number, max: number): string {
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const span = max - min || 1;
  return values
    .map((v, i) => {
      const x = PAD.left + (values.length === 1 ? innerW / 2 : (i / (values.length - 1)) * innerW);
      const y = PAD.top + innerH - ((v - min) / span) * innerH;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function areaPath(values: number[], min: number, max: number): string {
  if (values.length === 0) return '';
  const innerW = W - PAD.left - PAD.right;
  const baseY = H - PAD.bottom;
  const line = linePath(values, min, max);
  const lastX = PAD.left + (values.length === 1 ? innerW / 2 : innerW);
  const firstX = PAD.left + (values.length === 1 ? innerW / 2 : 0);
  return `${line} L${lastX.toFixed(1)},${baseY} L${firstX.toFixed(1)},${baseY} Z`;
}

interface PortfolioChartProps {
  /** Без id — весь портфель; с id — один счёт. */
  accountId?: string;
  /** Не грузить историю, пока блок свёрнут. */
  enabled?: boolean;
}

/** Сам график + периоды (без кнопки раскрытия). */
export function PortfolioChart({ accountId, enabled = true }: PortfolioChartProps) {
  const [period, setPeriod] = useState('3m');
  const fillId = useId().replace(/:/g, '');

  const days = PERIODS.find((p) => p.key === period)?.days ?? null;
  const from = days !== null ? shiftDate(days) : undefined;
  const qs = from ? `from=${from}` : '';
  const path = accountId
    ? `/history/${accountId}${qs ? `?${qs}` : ''}`
    : `/history${qs ? `?${qs}` : ''}`;

  const history = useQuery({
    queryKey: ['history', accountId ?? 'portfolio', period],
    queryFn: () => get<PortfolioHistoryDto>(path),
    enabled,
  });

  const data = history.data;
  const values = useMemo(() => (data?.points ?? []).map((p) => p.value.amount), [data]);
  const contributions = useMemo(
    () => (data?.points ?? []).map((p) => p.contributions.amount),
    [data],
  );
  const bounds = useMemo(() => {
    const all = [...values, ...contributions];
    if (all.length === 0) return null;
    const min = Math.min(...all);
    const max = Math.max(...all);
    // Плоская линия — небольшой запас, иначе деление на ноль в масштабе.
    if (min === max) {
      const pad = Math.abs(max) * 0.05 || 1;
      const lo = min >= 0 ? Math.max(0, min - pad) : min - pad;
      return { min: lo, max: max + pad };
    }
    // Шкала строго по данным (без «−800…10800» от паддинга).
    return { min, max };
  }, [values, contributions]);

  const hasPoints = (data?.points.length ?? 0) >= 1;
  const returnPct = data?.totalReturn ?? null;
  const positive = (returnPct ?? 0) >= 0;

  const intervalNote: Record<HistoryInterval, string> = {
    [HistoryInterval.DAY]: 'день',
    [HistoryInterval.WEEK]: 'неделя',
    [HistoryInterval.MONTH]: 'месяц',
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-mono text-xs text-mute">
          {returnPct !== null ? (
            <span className={positive ? 'text-cyber' : 'text-amber'}>
              {formatYieldPct(returnPct)}
              <span className="ml-1 text-mute">за период</span>
            </span>
          ) : (
            <span>доходность — н/д</span>
          )}
        </div>
        <span className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className={`rounded border px-2 py-0.5 text-xs transition-colors ${
                period === p.key
                  ? 'border-cyber bg-cyber/10 text-cyber'
                  : 'border-edge text-mute hover:text-ghost'
              }`}
            >
              {p.label}
            </button>
          ))}
        </span>
      </div>

      <div className="mt-2">
        {history.isLoading && <p className="text-sm text-mute">Считаю историю…</p>}
        {history.isError && (
          <p className="text-sm text-red-400">Не удалось загрузить историю</p>
        )}
        {data && !hasPoints && (
          <p className="text-sm text-mute">Истории пока нет — добавьте транзакции.</p>
        )}
        {data && hasPoints && bounds && (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-48 w-full"
            role="img"
            aria-label="График стоимости"
          >
            <defs>
              <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" className="text-cyber" stopOpacity="0.25" />
                <stop offset="100%" stopColor="currentColor" className="text-cyber" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map((f) => (
              <line
                key={f}
                x1={PAD.left}
                x2={W - PAD.right}
                y1={PAD.top + f * (H - PAD.top - PAD.bottom)}
                y2={PAD.top + f * (H - PAD.top - PAD.bottom)}
                stroke="currentColor"
                className="text-edge"
                strokeDasharray="2 6"
                strokeWidth="1"
              />
            ))}
            <path
              d={linePath(contributions, bounds.min, bounds.max)}
              fill="none"
              stroke="currentColor"
              className="text-mute"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
            <path d={areaPath(values, bounds.min, bounds.max)} fill={`url(#${fillId})`} stroke="none" />
            <path
              d={linePath(values, bounds.min, bounds.max)}
              fill="none"
              stroke="currentColor"
              className={positive ? 'text-cyber' : 'text-amber'}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <text x={PAD.left + 2} y={PAD.top + 10} className="fill-current font-mono text-mute" fontSize="10">
              {formatMinorUnits(Math.round(bounds.max))}
            </text>
            <text
              x={PAD.left + 2}
              y={H - PAD.bottom - 4}
              className="fill-current font-mono text-mute"
              fontSize="10"
            >
              {formatMinorUnits(Math.round(bounds.min))}
            </text>
            <text x={PAD.left} y={H - 6} className="fill-current font-mono text-mute" fontSize="10">
              {data.points[0].date}
            </text>
            <text
              x={W - PAD.right}
              y={H - 6}
              textAnchor="end"
              className="fill-current font-mono text-mute"
              fontSize="10"
            >
              {data.points[data.points.length - 1].date}
            </text>
          </svg>
        )}
      </div>

      {data && hasPoints && (
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs text-mute">
          <span>
            <span className="mr-1 inline-block h-0.5 w-4 align-middle bg-cyber" />
            стоимость
          </span>
          <span>
            <span className="mr-1 inline-block h-0.5 w-4 align-middle bg-mute opacity-60" />
            взносы
          </span>
          <span>
            шаг: {intervalNote[data.interval]} · {data.from}→{data.to}
          </span>
          {data.points[data.points.length - 1]?.priceSource === 'cost' && (
            <span className="text-amber">оценка по себестоимости</span>
          )}
        </div>
      )}

      {data && data.returns.length > 0 && (
        <div className="mt-2">
          <p className="font-mono text-xs tracking-tight text-cyber/80">
            <span className="text-mute">//</span> доходность по месяцам
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {data.returns.map((r) => (
              <span
                key={r.key}
                title={`${r.start}→${r.end} · Δ ${formatMoney(r.pnl)} · движение ${formatMoney(r.netFlow)}`}
                className={`rounded border px-1.5 py-0.5 font-mono text-xs ${
                  r.returnPct === null
                    ? 'border-edge text-mute'
                    : r.returnPct >= 0
                      ? 'border-cyber/50 text-cyber'
                      : 'border-amber/50 text-amber'
                }`}
              >
                {r.key.slice(2)} {r.returnPct !== null ? formatYieldPct(r.returnPct) : '—'}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface HistoryRevealProps {
  accountId?: string;
  /** Подпись на плоской кнопке. */
  label?: string;
}

/** Плоская кнопка; по нажатию блок с графиком выезжает вниз. */
export function HistoryReveal({ accountId, label = 'История' }: HistoryRevealProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3 border-t border-edge/40 pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between py-1.5 font-mono text-xs uppercase tracking-[0.18em] text-mute transition-colors hover:text-ghost"
      >
        <span>{label}</span>
        <span aria-hidden="true" className={`transition-transform duration-300 ${open ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </button>
      <div
        className={`grid transition-all duration-300 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="overflow-hidden">
          <div className="pb-1 pt-2">
            <PortfolioChart accountId={accountId} enabled={open} />
          </div>
        </div>
      </div>
    </div>
  );
}

export interface HistoryModalSummary {
  totalValue: Money;
  totalCostBasis: Money;
  unrealizedPnl: Money;
  /** % от cost basis; null если базы нет. */
  profitPct: number | null;
  dayChange: Money;
  /** % за день; null если нет вчерашней базы / нулевой день. */
  dayPct: number | null;
  precision: number;
}

interface HistoryModalProps {
  open: boolean;
  onClose: () => void;
  summary: HistoryModalSummary;
  /** Без id — весь портфель; с id — один счёт. */
  accountId?: string;
}

/** Модалка: сводка (стоимость / внесено / PnL / день) + полный PortfolioChart. */
export function HistoryModal({ open, onClose, summary, accountId }: HistoryModalProps) {
  if (!open) return null;

  const {
    totalValue,
    totalCostBasis,
    unrealizedPnl,
    profitPct,
    dayChange,
    dayPct,
    precision: prec,
  } = summary;

  return (
    <Modal tag="portfolio.history" title="Портфель · детали" onClose={onClose} className="max-w-2xl">
      <div className="flex flex-col gap-1 font-mono text-sm">
        <span className="flex items-center justify-between gap-3">
          <span className="text-mute">стоимость</span>
          <span className="text-ghost">{formatMoney(totalValue, prec)}</span>
        </span>
        <span className="flex items-center justify-between gap-3">
          <span className="text-mute">внесено</span>
          <span className="text-ghost">{formatMoney(totalCostBasis, prec)}</span>
        </span>
        <span className="flex items-center justify-between gap-3">
          <span className="text-mute">изменение</span>
          <span
            className={`whitespace-nowrap ${
              unrealizedPnl.amount >= 0 ? 'text-cyber' : 'text-amber'
            }`}
          >
            {formatSignedMoney(unrealizedPnl, prec)}
            {profitPct !== null && (
              <span className="text-mute"> ({formatPercent(profitPct)})</span>
            )}
          </span>
        </span>
        <span className="flex items-center justify-between gap-3">
          <span className="text-mute">за день</span>
          <span
            className={`whitespace-nowrap ${
              dayChange.amount >= 0 ? 'text-cyber' : 'text-amber'
            }`}
          >
            {formatSignedMoney(dayChange, prec)}
            {dayPct !== null && <span className="text-mute"> ({formatPercent(dayPct)})</span>}
          </span>
        </span>
      </div>

      <div className="mt-4 border-t border-edge/40 pt-3">
        <PortfolioChart accountId={accountId} enabled={open} />
      </div>
    </Modal>
  );
}
