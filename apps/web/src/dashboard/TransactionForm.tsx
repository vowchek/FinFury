import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { AccountType, AssetDto, AssetType, CreateTransactionDto, TransactionType } from '@finfury/contracts';
import { post } from '../api/client';
import { currencySymbol, precisionForType, toMinorUnits } from '../lib/money';
import { TRANSACTION_TYPE_LABELS } from '../lib/transaction-types';
import { AssetPicker } from './AssetPicker';

const FIELD =
  'w-full rounded border border-edge bg-panel px-3 py-2 text-sm text-ghost placeholder:text-mute focus:border-cyber/70 focus:outline-none';

const LABEL = 'block text-xs text-mute';

const TYPES: TransactionType[] = [
  TransactionType.BUY,
  TransactionType.SELL,
  TransactionType.DEPOSIT,
  TransactionType.WITHDRAWAL,
];

const QUANTITY_TYPES = new Set([TransactionType.BUY, TransactionType.SELL]);

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

interface TransactionFormProps {
  accountId: string;
  currency: string;
  accountType: string;
  onSuccess?: () => void;
}

export function TransactionForm({ accountId, currency, accountType, onSuccess }: TransactionFormProps) {
  const queryClient = useQueryClient();
  const [type, setType] = useState<TransactionType>(TransactionType.BUY);
  const [asset, setAsset] = useState<AssetDto | null>(null);
  const [date, setDate] = useState(today());
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [amount, setAmount] = useState('');
  const [fee, setFee] = useState('');
  const [fundWithDeposit, setFundWithDeposit] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const needsQuantity = QUANTITY_TYPES.has(type);
  const isBuy = type === TransactionType.BUY;
  // Цена/сумма сделки — в валюте котировки актива (USD для иностранной акции); бэкенд → FX в валюту счёта
  const quoteCurrency = asset?.currency ?? currency;
  const accountSym = currencySymbol(currency);
  const quoteSym = currencySymbol(quoteCurrency);

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const prec = precisionForType(
        asset?.type ?? (accountType === AccountType.WALLET ? AssetType.CRYPTO : undefined),
      );
      const priceMinor = toMinorUnits(price, prec);
      const qty = Number(quantity);
      const amountMinor = amount.trim() !== '' ? toMinorUnits(amount, prec) : Math.round(qty * priceMinor);
      const feeMinor = fee.trim() !== '' ? toMinorUnits(fee, precisionForType(undefined)) : 0;

      if (isBuy && fundWithDeposit) {
        if (amountMinor > 0) {
          await post(`/accounts/${accountId}/transactions`, {
            type: TransactionType.DEPOSIT,
            date,
            amount: { amount: amountMinor, currency: quoteCurrency },
            note: 'Пополнение под покупку',
          } satisfies CreateTransactionDto);
        }
        if (feeMinor > 0) {
          await post(`/accounts/${accountId}/transactions`, {
            type: TransactionType.DEPOSIT,
            date,
            amount: { amount: feeMinor, currency },
            note: 'Пополнение под комиссию',
          } satisfies CreateTransactionDto);
        }
      }

      const dto: CreateTransactionDto = {
        type,
        date,
        amount: { amount: amountMinor, currency: needsQuantity ? quoteCurrency : currency },
      };
      if (asset) dto.assetId = asset.id;
      if (needsQuantity) {
        dto.quantity = qty;
        if (priceMinor > 0) dto.price = { amount: priceMinor, currency: quoteCurrency };
      }
      if (feeMinor > 0) dto.fee = { amount: feeMinor, currency };
      return post(`/accounts/${accountId}/transactions`, dto);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions', accountId] });
      queryClient.invalidateQueries({ queryKey: ['transactions', accountId] });
      queryClient.invalidateQueries({ queryKey: ['lots', accountId] });
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      queryClient.invalidateQueries({ queryKey: ['history'] });
      setAsset(null);
      setQuantity('');
      setPrice('');
      setAmount('');
      setFee('');
      setFundWithDeposit(true);
      setDate(today());
      setError(null);
      onSuccess?.();
    },
    onError: (err: Error) => setError(err.message),
  });

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (needsQuantity && !asset) {
      setError('Выберите актив');
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
            onChange={(e) => setType(e.target.value as TransactionType)}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {TRANSACTION_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className={LABEL}>
          Дата
          <input className={FIELD} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
      </div>

      {needsQuantity && (
        <label className={LABEL}>
          Актив
          <AssetPicker
            value={asset}
            onChange={setAsset}
            accountId={accountId}
            accountType={accountType as AccountType}
          />
        </label>
      )}

      {needsQuantity && (
        <div className="grid grid-cols-2 gap-3">
          <label className={LABEL}>
            Количество
            <input
              className={FIELD}
              type="number"
              min="0"
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />
          </label>
          <label className={LABEL}>
            Цена за штуку ({quoteSym})
            <input
              className={FIELD}
              type="number"
              min="0"
              step="any"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
            />
          </label>
        </div>
      )}

      {needsQuantity && quoteCurrency !== currency && (
        <p className="text-[11px] text-mute">
          Цена в {quoteCurrency}; в книгу счёта ({currency}) пересчитаем по курсу ЦБ.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className={LABEL}>
          Сумма ({needsQuantity ? quoteSym : accountSym})
          <input
            className={FIELD}
            type="number"
            min="0"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="авто"
          />
        </label>
        <label className={LABEL}>
          Комиссия ({accountSym})
          <input
            className={FIELD}
            type="number"
            min="0"
            step="any"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            placeholder="0.00"
          />
        </label>
      </div>

      {isBuy && (
        <label className="flex items-center gap-2 text-sm text-mute">
          <input
            type="checkbox"
            checked={fundWithDeposit}
            onChange={(e) => setFundWithDeposit(e.target.checked)}
            className="accent-neon"
          />
          {fundWithDeposit ? 'С пополнением' : 'Из кэша'}
        </label>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-neon px-5 py-2.5 text-sm font-semibold text-night transition-colors hover:bg-neon/90 disabled:opacity-50"
      >
        {isPending ? 'Записываю…' : 'Записать транзакцию'}
      </button>
    </form>
  );
}
