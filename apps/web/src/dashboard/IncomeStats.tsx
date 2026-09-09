import { useQuery } from '@tanstack/react-query';
import { AssetDto, IncomeStatsDto, IncomeStatsItemDto } from '@finfury/contracts';
import { get } from '../api/client';
import { Modal } from '../components/Modal';
import { formatMoney, formatYieldPct } from '../lib/money';

interface IncomeStatsProps {
  accountId: string;
  onClose: () => void;
}

function StatsTable({
  title,
  rows,
  labelOf,
  showYield = false,
}: {
  title: string;
  rows: IncomeStatsItemDto[];
  labelOf: (key: string) => string;
  showYield?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <div>
      <p className="font-mono text-xs tracking-tight text-cyber/80">
        <span className="text-mute">//</span> {title}
      </p>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-mute">
            <th className="pb-1">{title}</th>
            <th className="pb-1 text-right">Кол-во</th>
            <th className="pb-1 text-right">Gross</th>
            <th className="pb-1 text-right">Налог</th>
            <th className="pb-1 text-right">Net</th>
            {showYield && <th className="pb-1 text-right">Доходность</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-edge/40">
          {rows.map((r) => (
            <tr key={r.key} className="font-mono">
              <td className="py-1.5 text-ghost">{labelOf(r.key)}</td>
              <td className="py-1.5 text-right text-mute">{r.count}</td>
              <td className="py-1.5 text-right text-ghost">{formatMoney(r.gross)}</td>
              <td className="py-1.5 text-right text-mute">{formatMoney(r.taxWithheld)}</td>
              <td className="py-1.5 text-right text-cyber">{formatMoney(r.net)}</td>
              {showYield && (
                <td className="py-1.5 text-right text-cyber">
                  {r.yieldPct !== null && r.yieldPct !== undefined ? formatYieldPct(r.yieldPct) : '—'}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Отчёт по доходам счёта: итоги, периоды (YYYY-MM) и активы; доходность — по активам и итогам. */
export function IncomeStats({ accountId, onClose }: IncomeStatsProps) {
  const stats = useQuery({
    queryKey: ['income-stats', accountId],
    queryFn: () => get<IncomeStatsDto>(`/income/stats?accountId=${accountId}`),
  });
  // Ключ byAsset — id актива; символы берём из справочника.
  const assets = useQuery({
    queryKey: ['assets'],
    queryFn: () => get<AssetDto[]>('/assets'),
  });

  const symbolOf = new Map<string, string>();
  for (const a of assets.data ?? []) symbolOf.set(a.id, a.symbol);

  const data = stats.data;
  const hasData =
    !!data && (data.totals.length > 0 || data.byPeriod.length > 0 || data.byAsset.length > 0);

  return (
    <Modal tag="income.stats" title="Отчёт по доходам" onClose={onClose} className="max-w-2xl">
      {stats.isLoading && <p className="text-sm text-mute">Считаю…</p>}
      {stats.isError && <p className="text-sm text-red-400">Не удалось загрузить отчёт</p>}
      {data && !hasData && (
        <p className="text-sm text-mute">Доходов пока нет — отчёт появится после первого дохода.</p>
      )}
      {data && hasData && (
        <div className="flex flex-col gap-4">
          <StatsTable title="Итоги" rows={data.totals} labelOf={(k) => k} showYield />
          <StatsTable title="По периодам" rows={data.byPeriod} labelOf={(k) => k} />
          <StatsTable title="По активам" rows={data.byAsset} labelOf={(k) => symbolOf.get(k) ?? k} showYield />
        </div>
      )}
    </Modal>
  );
}