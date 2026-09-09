import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { AssetDto, IncomeEventDto, IncomeEventType } from '@finfury/contracts';
import { get } from '../api/client';
import { Modal } from '../components/Modal';
import { formatMoney } from '../lib/money';
import { IncomeStats } from './IncomeStats';

const TYPE_LABELS: Record<IncomeEventType, string> = {
  [IncomeEventType.DIVIDEND]: 'Дивиденд',
  [IncomeEventType.COUPON]: 'Купон',
  [IncomeEventType.INTEREST]: 'Проценты',
  [IncomeEventType.DISTRIBUTION]: 'Распределение',
};

interface IncomeListProps {
  accountId: string;
  accountName: string;
  onClose: () => void;
}

/** Список доходов счёта: дата выплаты, актив, тип, gross/налог/net, бейдж DRIP. */
export function IncomeList({ accountId, accountName, onClose }: IncomeListProps) {
  const [statsOpen, setStatsOpen] = useState(false);

  const income = useQuery({
    queryKey: ['income', accountId],
    queryFn: () => get<IncomeEventDto[]>(`/income?accountId=${accountId}`),
  });
  // IncomeEventDto не содержит symbol — берём справочник активов для маппинга.
  const assets = useQuery({
    queryKey: ['assets'],
    queryFn: () => get<AssetDto[]>('/assets'),
  });

  const symbolOf = new Map<string, string>();
  for (const a of assets.data ?? []) symbolOf.set(a.id, a.symbol);

  return (
    <Modal
      tag="income.list"
      title={`Доходы · ${accountName}`}
      onClose={onClose}
      className="max-w-2xl"
      closeOnEscape={!statsOpen}
    >
      {income.isLoading && <p className="text-sm text-mute">Загружаю…</p>}
      {income.isError && <p className="text-sm text-red-400">Не удалось загрузить доходы</p>}
      {income.data && income.data.length === 0 && (
        <p className="text-sm text-mute">Доходов пока нет — добавьте первый через «+ Доход».</p>
      )}
      {income.data && income.data.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-mute">
              <th className="pb-1">Дата</th>
              <th className="pb-1">Актив</th>
              <th className="pb-1">Тип</th>
              <th className="pb-1 text-right">Gross</th>
              <th className="pb-1 text-right">Налог</th>
              <th className="pb-1 text-right">Net</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge/40">
            {income.data.map((e) => (
              <tr key={e.id} className="font-mono">
                <td className="py-1.5 text-mute">{e.paymentDate}</td>
                <td className="py-1.5 text-ghost">
                  {symbolOf.get(e.assetId) ?? e.assetId}
                  {e.reinvested && (
                    <span className="ml-2 rounded border border-cyber/50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-cyber">
                      DRIP
                    </span>
                  )}
                </td>
                <td className="py-1.5 text-mute">{TYPE_LABELS[e.type] ?? e.type}</td>
                <td className="py-1.5 text-right text-ghost">{formatMoney(e.grossAmount)}</td>
                <td className="py-1.5 text-right text-mute">
                  {e.taxWithheld ? formatMoney(e.taxWithheld) : '—'}
                </td>
                <td className="py-1.5 text-right text-cyber">{formatMoney(e.netAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={() => setStatsOpen(true)}
          className="rounded border border-cyber/50 px-4 py-2 text-sm text-cyber transition-colors hover:bg-cyber/10"
        >
          Отчёт
        </button>
      </div>

      {statsOpen && <IncomeStats accountId={accountId} onClose={() => setStatsOpen(false)} />}
    </Modal>
  );
}