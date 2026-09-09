import { useState, type ReactNode } from 'react';
import { AssetType, PositionDto } from '@finfury/contracts';
import {
  currencySymbol,
  formatMinorUnits,
  formatMinorUnitsFull,
  formatMoney,
  formatPercent,
  formatSignedMinorUnits,
  formatSignedMoney,
  precisionForType,
} from '../lib/money';
import type { CashBreakdown } from '../lib/cash-breakdown';

const CASH_ASSET_ID = '__cash__';

function isCashRow(p: PositionDto): boolean {
  return p.assetId === CASH_ASSET_ID || p.asset.type === AssetType.CASH;
}

function formatShare(percent: number): string {
  return `${percent.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} %`;
}

function formatQuantity(qty: number): string {
  return qty
    .toLocaleString('ru-RU', { maximumFractionDigits: 8 })
    .replace(/\u00A0/g, ' ');
}

/** Себестоимость позиции (AVCO): quantity × avgCostBasis. */
function costBasisAmount(p: PositionDto): number {
  return Math.round(p.quantity * p.avgCostBasis.amount);
}

function BreakdownTooltip({
  currency,
  lines,
  precision,
}: {
  currency: string;
  lines: { label: string; amount: number }[];
  precision: number;
}) {
  const symbol = currencySymbol(currency);
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute left-auto right-0 top-full z-30 mt-1.5 hidden w-max rounded border border-edge bg-night px-2.5 py-1.5 text-xs font-sans text-ghost shadow-lg group-hover:block"
    >
      <span className="grid grid-cols-[auto_auto_auto] items-baseline gap-x-1.5 gap-y-0.5">
        {lines.map((line) => (
          <span key={line.label} className="contents">
            <span className="pr-2.5 text-left text-mute">{line.label}</span>
            <span className="whitespace-nowrap text-right font-mono tabular-nums">
              {formatSignedMinorUnits(line.amount, precision)}
            </span>
            <span className="whitespace-nowrap font-mono text-mute">{symbol}</span>
          </span>
        ))}
      </span>
    </span>
  );
}

/** Двухстрочная ячейка: итог сверху, вторичная метрика снизу. */
function Stack({
  primary,
  secondary,
  primaryClass,
  secondaryClass = 'text-[11px] text-mute',
  align = 'right',
}: {
  primary: ReactNode;
  secondary?: ReactNode;
  primaryClass?: string;
  secondaryClass?: string;
  align?: 'left' | 'right';
}) {
  const alignCls = align === 'right' ? 'items-end text-right' : 'items-start text-left';
  return (
    <span className={`inline-flex flex-col gap-0.5 ${alignCls}`}>
      <span className={`whitespace-nowrap tabular-nums ${primaryClass ?? ''}`}>{primary}</span>
      {secondary !== undefined && secondary !== null && (
        <span className={`whitespace-nowrap tabular-nums ${secondaryClass}`}>{secondary}</span>
      )}
    </span>
  );
}

interface PositionsTableProps {
  positions: PositionDto[];
  /** Σ net доходов по assetId (из IncomeEvent). */
  incomeByAsset?: Map<string, number>;
  /** Разбивка кэша (депозит / доход / комиссия / налоги с доходов / сделки). */
  cashBreakdown?: CashBreakdown;
  currency: string;
  /** Precision счёта (2 брокер / 6 WALLET) — должна совпадать с вводом. */
  precision?: number;
}

function CashRow({
  p,
  share,
  cashBreakdown,
  currency,
  precision,
}: {
  p: PositionDto;
  share: number | null;
  cashBreakdown?: CashBreakdown;
  currency: string;
  precision: number;
}) {
  const cashLines = cashBreakdown
    ? [
        { label: 'депозит', amount: cashBreakdown.deposit },
        { label: 'доход', amount: cashBreakdown.income },
        ...(cashBreakdown.fee !== 0 ? [{ label: 'комиссия', amount: cashBreakdown.fee }] : []),
        ...(cashBreakdown.tax !== 0 ? [{ label: 'налоги', amount: cashBreakdown.tax }] : []),
        ...(cashBreakdown.trading !== 0
          ? [{ label: 'сделки', amount: cashBreakdown.trading }]
          : []),
      ]
    : null;

  return (
    <tr className="font-mono">
      <td className="whitespace-nowrap py-2.5 pr-3 align-top text-ghost">{p.asset.name}</td>
      <td className="py-2.5 text-right align-top text-mute">—</td>
      <td className="py-2.5 text-right align-top text-mute">—</td>
      <td className="relative py-2.5 pl-2 text-right align-top text-ghost">
        {p.currentValue && cashLines ? (
          <span className="group relative inline-block cursor-help border-b border-dotted border-mute/50">
            {formatMoney(p.currentValue, precision)}
            <BreakdownTooltip currency={currency} lines={cashLines} precision={precision} />
          </span>
        ) : p.currentValue ? (
          formatMoney(p.currentValue, precision)
        ) : (
          '—'
        )}
      </td>
      <td className="py-2.5 text-right align-top text-mute">—</td>
      <td className="py-2.5 text-right align-top text-mute">—</td>
      <td className="py-2.5 pl-2 text-right align-top text-mute">
        {share !== null ? formatShare(share) : '—'}
      </td>
    </tr>
  );
}

/** Цена за шт: до 2 знаков + валюта; для крипты hover → полная точность. */
function UnitPrice({
  amount,
  currency,
  assetType,
}: {
  amount: number;
  currency: string;
  assetType: AssetType;
}) {
  const prec = precisionForType(assetType);
  const display = `${formatMinorUnits(amount, prec)} ${currencySymbol(currency)}`;
  if (prec === 2) return <>{display}</>;
  const full = `${formatMinorUnitsFull(amount, prec)} ${currencySymbol(currency)}`;
  return (
    <span className="cursor-help border-b border-dotted border-mute/30" title={full}>
      {display}
    </span>
  );
}

function AssetRow({
  p,
  share,
  incomeByAsset,
  currency,
  precision,
  muted,
}: {
  p: PositionDto;
  share: number | null;
  incomeByAsset?: Map<string, number>;
  currency: string;
  precision: number;
  muted?: boolean;
}) {
  const quoteCurrency = p.currentPrice?.currency ?? p.asset.currency ?? currency;
  const valueCurrency = p.currentValue?.currency ?? currency;
  const costCurrency = p.avgCostBasis.currency || quoteCurrency;
  const rowPrec =
    p.asset.type === AssetType.CRYPTO ? precisionForType(AssetType.CRYPTO) : precision;

  const costBasis = costBasisAmount(p);
  const unrealized = p.unrealizedPnl?.amount ?? 0;
  const realized = p.realizedPnl?.amount ?? 0;
  const pricePnl = unrealized + realized;
  const incomePnl = incomeByAsset?.get(p.assetId) ?? 0;
  const hasProfit =
    p.unrealizedPnl !== undefined || p.realizedPnl !== undefined || incomePnl !== 0;
  const totalPnl = pricePnl + incomePnl;
  const pnlPct = costBasis > 0 && hasProfit ? (totalPnl / costBasis) * 100 : null;
  const profitTone = !hasProfit ? 'text-mute' : totalPnl >= 0 ? 'text-cyber' : 'text-amber';
  const nameTone = muted ? 'text-mute' : 'text-ghost';

  const dc = p.dayChange?.amount ?? 0;
  const dcPct = p.dayChangePct ?? null;
  const hasDc = dc !== 0 || p.dayChange !== undefined;
  const dcTone = !hasDc ? 'text-mute' : dc >= 0 ? 'text-cyber' : 'text-amber';

  return (
    <tr className={`font-mono ${muted ? 'opacity-70' : ''}`}>
      <td className={`whitespace-nowrap py-2.5 pr-3 align-top ${nameTone}`}>
        <Stack
          align="left"
          primary={p.asset.name}
          primaryClass={muted ? 'text-mute' : 'text-ghost'}
          secondary={p.asset.symbol}
          secondaryClass="text-[11px] text-mute"
        />
      </td>
      <td className="whitespace-nowrap py-2.5 pl-2 text-right align-top text-ghost tabular-nums">
        {formatQuantity(p.quantity)}
      </td>
      <td className="whitespace-nowrap py-2.5 pl-3 text-right align-top">
        <Stack
          primary={formatMoney({ amount: costBasis, currency: costCurrency }, rowPrec)}
          primaryClass={muted ? 'text-mute' : 'text-ghost'}
          secondary={
            <UnitPrice
              amount={p.avgCostBasis.amount}
              currency={costCurrency}
              assetType={p.asset.type}
            />
          }
        />
      </td>
      <td className="whitespace-nowrap py-2.5 pl-3 text-right align-top">
        <Stack
          primary={
            p.currentValue ? formatMoney(p.currentValue, rowPrec) : '—'
          }
          primaryClass={p.currentValue ? (muted ? 'text-mute' : 'text-neon') : 'text-mute'}
          secondary={
            p.currentPrice ? (
              <UnitPrice
                amount={p.currentPrice.amount}
                currency={p.currentPrice.currency}
                assetType={p.asset.type}
              />
            ) : (
              '—'
            )
          }
        />
      </td>
      <td className={`relative whitespace-nowrap py-2.5 pl-3 text-right align-top ${profitTone}`}>
        {hasProfit ? (
          <Stack
            primary={
              <span className="group relative inline-block cursor-help border-b border-dotted border-mute/50">
                {formatSignedMoney({ amount: totalPnl, currency: valueCurrency }, rowPrec)}
                <BreakdownTooltip
                  currency={valueCurrency}
                  precision={rowPrec}
                  lines={[
                    { label: 'цена', amount: pricePnl },
                    { label: 'доход', amount: incomePnl },
                  ]}
                />
              </span>
            }
            primaryClass={profitTone}
            secondary={pnlPct !== null ? formatPercent(pnlPct) : '—'}
            secondaryClass={`text-[11px] ${profitTone}`}
          />
        ) : (
          '—'
        )}
      </td>
      <td className={`whitespace-nowrap py-2.5 pl-3 text-right align-top ${dcTone}`}>
        {hasDc ? (
          <Stack
            primary={formatSignedMoney({ amount: dc, currency: valueCurrency }, rowPrec)}
            primaryClass={dcTone}
            secondary={dcPct !== null ? formatPercent(dcPct) : '—'}
            secondaryClass={`text-[11px] ${dcTone}`}
          />
        ) : (
          '—'
        )}
      </td>
      <td className="whitespace-nowrap py-2.5 pl-3 text-right align-top text-mute tabular-nums">
        {share !== null ? formatShare(share) : '—'}
      </td>
    </tr>
  );
}

/** Детальная таблица позиций: двухстрочные ячейки (брокерский layout) + доля. */
export function PositionsTable({
  positions,
  incomeByAsset,
  cashBreakdown,
  currency,
  precision = 2,
}: PositionsTableProps) {
  const [showClosed, setShowClosed] = useState(false);

  const totalValue = positions.reduce((sum, p) => sum + (p.currentValue?.amount ?? 0), 0);
  const shareOf = (p: PositionDto) => {
    const value = p.currentValue?.amount ?? 0;
    return totalValue > 0 ? (value / totalValue) * 100 : null;
  };

  const open: PositionDto[] = [];
  const closed: PositionDto[] = [];
  let cash: PositionDto | undefined;
  for (const p of positions) {
    if (isCashRow(p)) cash = p;
    else if (p.quantity === 0) closed.push(p);
    else open.push(p);
  }

  return (
    <div>
      {/* overflow-x только по X: крупные суммы; tooltips с z-30 поверх ячеек */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[52rem] text-sm">
          <thead>
            <tr className="text-left text-xs text-mute">
              <th className="pb-2 pr-3 font-normal">Актив</th>
              <th className="pb-2 pl-2 text-right font-normal">Кол-во</th>
              <th className="pb-2 pl-3 text-right font-normal">Вложено</th>
              <th className="pb-2 pl-3 text-right font-normal">Текущая стоимость</th>
              <th className="pb-2 pl-3 text-right font-normal">Прибыль</th>
              <th className="pb-2 pl-3 text-right font-normal">За день</th>
              <th className="pb-2 pl-3 text-right font-normal">Доля</th>
            </tr>
          </thead>
          <tbody className="[&_tr]:border-t [&_tr]:border-edge/40">
            {open.map((p) => (
              <AssetRow
                key={p.assetId}
                p={p}
                share={shareOf(p)}
                incomeByAsset={incomeByAsset}
                currency={currency}
                precision={precision}
              />
            ))}
            {cash && (
              <CashRow
                p={cash}
                share={shareOf(cash)}
                cashBreakdown={cashBreakdown}
                currency={currency}
                precision={precision}
              />
            )}
            {showClosed &&
              closed.map((p) => (
                <AssetRow
                  key={p.assetId}
                  p={p}
                  share={shareOf(p)}
                  incomeByAsset={incomeByAsset}
                  currency={currency}
                  precision={precision}
                  muted
                />
              ))}
          </tbody>
        </table>
      </div>
      {closed.length > 0 && (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => setShowClosed((v) => !v)}
            className="rounded border border-edge/70 px-2 py-0.5 text-[11px] uppercase tracking-wide text-mute transition-colors hover:border-neon/50 hover:text-ghost"
          >
            {showClosed
              ? 'Скрыть закрытые'
              : `Закрытые · ${closed.length}`}
          </button>
        </div>
      )}
    </div>
  );
}
