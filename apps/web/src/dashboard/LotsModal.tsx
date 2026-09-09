import { useQuery } from '@tanstack/react-query';
import { AccountType, AssetDto, LotDto } from '@finfury/contracts';
import { get } from '../api/client';
import { Modal } from '../components/Modal';
import { formatMoney, precisionForAccount, precisionForType } from '../lib/money';

interface LotsModalProps {
  accountId: string;
  accountName: string;
  accountType: AccountType;
  onClose: () => void;
}

/** Партии счёта (cost basis по FIFO): актив, дата приобретения, остаток, cost basis, себестоимость. */
export function LotsModal({ accountId, accountName, accountType, onClose }: LotsModalProps) {
  const lots = useQuery({
    queryKey: ['lots', accountId],
    queryFn: () => get<LotDto[]>(`/accounts/${accountId}/lots`),
  });
  // LotDto не содержит symbol — берём справочник активов для маппинга.
  const assets = useQuery({
    queryKey: ['assets'],
    queryFn: () => get<AssetDto[]>('/assets'),
  });

  const symbolOf = new Map<string, string>();
  const typeOf = new Map<string, AssetDto['type']>();
  for (const a of assets.data ?? []) {
    symbolOf.set(a.id, a.symbol);
    typeOf.set(a.id, a.type);
  }
  const accountPrec = precisionForAccount(accountType);

  return (
    <Modal tag="lots.list" title={`Партии · ${accountName}`} onClose={onClose} className="max-w-2xl">
      {lots.isLoading && <p className="text-sm text-mute">Загружаю…</p>}
      {lots.isError && <p className="text-sm text-red-400">Не удалось загрузить партии</p>}
      {lots.data && lots.data.length === 0 && (
        <p className="text-sm text-mute">Партий нет — добавьте покупки.</p>
      )}
      {lots.data && lots.data.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-mute">
              <th className="pb-1">Актив</th>
              <th className="pb-1">Приобретено</th>
              <th className="pb-1 text-right">Остаток</th>
              <th className="pb-1 text-right">Cost basis</th>
              <th className="pb-1 text-right">Себестоимость</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge/40">
            {lots.data.map((l) => {
              const assetType = typeOf.get(l.assetId);
              const prec = assetType !== undefined ? precisionForType(assetType) : accountPrec;
              const total = Math.round(l.quantity * l.costBasis.amount);
              return (
                <tr key={l.id} className="font-mono">
                  <td className="py-1.5 text-ghost">{symbolOf.get(l.assetId) ?? l.assetId}</td>
                  <td className="py-1.5 text-mute">{l.acquiredAt}</td>
                  <td className="py-1.5 text-right text-mute">{l.quantity}</td>
                  <td className="py-1.5 text-right text-mute">{formatMoney(l.costBasis, prec)}</td>
                  <td className="py-1.5 text-right text-ghost">
                    {formatMoney({ amount: total, currency: l.costBasis.currency }, prec)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
