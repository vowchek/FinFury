import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { AccountType, AssetDto, CreateIncomeEventDto, IncomeEventDto, IncomeEventType } from '@finfury/contracts';
import { post } from '../api/client';
import { formatMoney, precisionForAccount, precisionForType, toMinorUnits } from '../lib/money';
import { AssetPicker } from './AssetPicker';

const FIELD =
  'w-full rounded border border-edge bg-panel px-3 py-2 text-sm text-ghost placeholder:text-mute focus:border-cyber/70 focus:outline-none';

const LABEL = 'block text-xs text-mute';

const TYPES: { value: IncomeEventType; label: string }[] = [
  { value: IncomeEventType.DIVIDEND, label: 'Дивиденд' },
  { value: IncomeEventType.COUPON, label: 'Купон' },
  { value: IncomeEventType.INTEREST, label: 'Проценты' },
  { value: IncomeEventType.DISTRIBUTION, label: 'Распределение' },
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

interface IncomeFormProps {
  accountId: string;
  currency: string;
  accountType: AccountType;
  /** Вызывается после успешной записи (например, чтобы закрыть модалку). */
  onSuccess?: () => void;
}

/**
 * Форма дохода (ADR-006): тип, актив, дата выплаты, gross, налог и опция DRIP.
 * `net = gross − налог` считается на фронте живым предпросчётом (на бэке — тоже,
 * клиенту не доверяем). При DRIP бэкенд создаёт income + buy-транзакции
 * (quantity = net / reinvestPrice, дата покупки = paymentDate) — форма передаёт
 * только цену реинвестирования, как зафиксировано в контракте.
 */
export function IncomeForm({ accountId, currency, accountType, onSuccess }: IncomeFormProps) {
  const queryClient = useQueryClient();
  const [type, setType] = useState<IncomeEventType>(IncomeEventType.DIVIDEND);
  const [asset, setAsset] = useState<AssetDto | null>(null);
  const [paymentDate, setPaymentDate] = useState(today());
  const [gross, setGross] = useState('');
  const [tax, setTax] = useState('');
  const [reinvested, setReinvested] = useState(false);
  const [reinvestPrice, setReinvestPrice] = useState('');
  const [error, setError] = useState<string | null>(null);

  const prec = asset
    ? precisionForType(asset.type)
    : precisionForAccount(accountType);
  const grossMinor = toMinorUnits(gross, prec);
  const taxMinor = toMinorUnits(tax, prec);
  const netMinor = Math.max(grossMinor - taxMinor, 0);
  const net = { amount: netMinor, currency };

  // Предпросмотр количества при DRIP: бэкенд покупает на фактически полученную сумму (net).
  const reinvestPriceMinor = toMinorUnits(reinvestPrice, prec);
  const reinvestQty =
    reinvested && reinvestPriceMinor > 0 ? netMinor / reinvestPriceMinor : null;

  const { mutate, isPending } = useMutation({
    mutationFn: () => {
      const dto: CreateIncomeEventDto = {
        accountId,
        assetId: asset!.id,
        type,
        paymentDate,
        grossAmount: { amount: grossMinor, currency },
        reinvested,
      };
      if (tax.trim() !== '') dto.taxWithheld = { amount: taxMinor, currency };
      if (reinvested) dto.reinvestPrice = { amount: reinvestPriceMinor, currency };
      return post<IncomeEventDto>('/income', dto);
    },
    onSuccess: () => {
      // Доход создаёт income-транзакцию книги; при DRIP — ещё и buy (позиции и партии меняются).
      queryClient.invalidateQueries({ queryKey: ['transactions', accountId] });
      queryClient.invalidateQueries({ queryKey: ['positions', accountId] });
      queryClient.invalidateQueries({ queryKey: ['lots', accountId] });
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      queryClient.invalidateQueries({ queryKey: ['income', accountId] });
      queryClient.invalidateQueries({ queryKey: ['income-stats', accountId] });
      queryClient.invalidateQueries({ queryKey: ['history'] });
      // Сброс формы
      setAsset(null);
      setGross('');
      setTax('');
      setReinvested(false);
      setReinvestPrice('');
      setPaymentDate(today());
      setError(null);
      onSuccess?.();
    },
    onError: (err: Error) => setError(err.message),
  });

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!asset) {
      setError('Выберите актив');
      return;
    }
    if (grossMinor <= 0) {
      setError('Укажите сумму дохода (gross)');
      return;
    }
    if (taxMinor > grossMinor) {
      setError('Налог не может превышать сумму дохода');
      return;
    }
    if (reinvested && reinvestPriceMinor <= 0) {
      setError('Укажите цену реинвестирования');
      return;
    }
    setError(null);
    mutate();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <label className={LABEL}>
          Тип
          <select
            className={FIELD}
            value={type}
            onChange={(e) => setType(e.target.value as IncomeEventType)}
          >
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className={LABEL}>
          Дата выплаты
          <input
            className={FIELD}
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            required
          />
        </label>
      </div>

      <label className={LABEL}>
        Актив
        <AssetPicker value={asset} onChange={setAsset} accountId={accountId} accountType={accountType} />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className={LABEL}>
          Сумма дохода (gross)
          <input
            className={FIELD}
            type="number"
            min="0"
            step="any"
            value={gross}
            onChange={(e) => setGross(e.target.value)}
            placeholder="0.00"
            required
          />
        </label>
        <label className={LABEL}>
          Налог (taxWithheld)
          <input
            className={FIELD}
            type="number"
            min="0"
            step="any"
            value={tax}
            onChange={(e) => setTax(e.target.value)}
            placeholder="0.00"
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm text-mute">
        <input
          type="checkbox"
          checked={reinvested}
          onChange={(e) => setReinvested(e.target.checked)}
          className="accent-neon"
        />
        Реинвестировать (DRIP)
      </label>

      {reinvested && (
        <label className={LABEL}>
          Цена реинвестирования
          <input
            className={FIELD}
            type="number"
            min="0"
            step="any"
            value={reinvestPrice}
            onChange={(e) => setReinvestPrice(e.target.value)}
            placeholder="0.00"
            required
          />
          {reinvestQty !== null && (
            <span className="mt-1 block font-mono text-xs text-mute">
              ≈ {reinvestQty.toLocaleString('ru-RU', { maximumFractionDigits: 8 })} шт. по цене
              реинвестирования на дату выплаты
            </span>
          )}
        </label>
      )}

      <p className="flex items-center justify-between rounded border border-edge/50 bg-panel px-3 py-2 font-mono text-sm">
        <span className="text-mute">на руки (net)</span>
        <span className="text-cyber">{formatMoney(net, prec)}</span>
      </p>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-neon px-5 py-2.5 text-sm font-semibold text-night transition-colors hover:bg-neon/90 disabled:opacity-50"
      >
        {isPending ? 'Сохраняю…' : 'Сохранить доход'}
      </button>
    </form>
  );
}