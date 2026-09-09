import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { AccountType, AssetDto, IncomeEventType } from '@finfury/contracts';
import { ApiError, post } from '../api/client';
import {
  currencySymbol,
  formatMoney,
  precisionForAccount,
  precisionForType,
  toMinorUnits,
} from '../lib/money';
import {
  buildIncomeDtos,
  buildOpeningDto,
  defaultIncomeType,
  INCOME_TYPE_OPTIONS,
  isOpeningRowFilled,
  partialIncomeErrorMessage,
  type OpeningRowDraft,
} from '../lib/opening-income';
import { AssetPicker } from './AssetPicker';

const FIELD =
  'w-full rounded border border-edge bg-panel px-3 py-2 text-sm text-ghost placeholder:text-mute focus:border-cyber/70 focus:outline-none';

const LABEL = 'block text-xs text-mute';

interface Row extends OpeningRowDraft {
  id: number;
  incomeOpen: boolean;
}

let nextId = 0;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function newRow(): Row {
  return {
    id: nextId++,
    asset: null,
    quantity: '',
    avgPrice: '',
    incomeOpen: false,
    incomeType: IncomeEventType.DIVIDEND,
    incomeGross: '',
    incomeTax: '',
  };
}

interface OpeningFormProps {
  accountId: string;
  currency: string;
  accountType: AccountType;
  onSuccess?: () => void;
}

function invalidateAfterOpening(queryClient: ReturnType<typeof useQueryClient>, accountId: string) {
  queryClient.invalidateQueries({ queryKey: ['positions', accountId] });
  queryClient.invalidateQueries({ queryKey: ['transactions', accountId] });
  queryClient.invalidateQueries({ queryKey: ['lots', accountId] });
  queryClient.invalidateQueries({ queryKey: ['portfolio'] });
  queryClient.invalidateQueries({ queryKey: ['history'] });
  queryClient.invalidateQueries({ queryKey: ['income', accountId] });
  queryClient.invalidateQueries({ queryKey: ['income-stats', accountId] });
}

/**
 * Snapshot-ввод: средняя цена в валюте актива; бэкенд переводит в валюту счёта (FX).
 * Опционально — доход по строке: после opening → POST /income (без DRIP).
 */
export function OpeningForm({ accountId, currency, accountType, onSuccess }: OpeningFormProps) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(today());
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [error, setError] = useState<string | null>(null);
  /** Opening уже сохранён, но доход частично упал — форму больше не сабмитим. */
  const [openingDone, setOpeningDone] = useState(false);

  function updateRow(id: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeRow(id: number) {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((r) => r.id !== id)));
  }

  function onAssetChange(id: number, asset: AssetDto | null) {
    updateRow(id, {
      asset,
      incomeType: defaultIncomeType(asset?.type),
    });
  }

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const draftRows: OpeningRowDraft[] = rows;
      const openingDto = buildOpeningDto(date, draftRows, accountType);
      await post(`/accounts/${accountId}/opening`, openingDto);

      const incomeDtos = buildIncomeDtos({
        rows: draftRows,
        accountId,
        currency,
        paymentDate: date,
      });

      const failedSymbols: string[] = [];
      for (const dto of incomeDtos) {
        try {
          await post('/income', dto);
        } catch {
          const symbol =
            rows.find((r) => r.asset?.id === dto.assetId)?.asset?.symbol ?? dto.assetId;
          failedSymbols.push(symbol);
        }
      }

      return { failedSymbols, incomeAttempted: incomeDtos.length };
    },
    onSuccess: ({ failedSymbols }) => {
      invalidateAfterOpening(queryClient, accountId);
      if (failedSymbols.length > 0) {
        setOpeningDone(true);
        setError(partialIncomeErrorMessage(failedSymbols));
        return;
      }
      onSuccess?.();
    },
    onError: (err: Error) => {
      if (err instanceof ApiError && err.status === 409) {
        setError('У счёта уже есть транзакции — snapshot-ввод доступен только для пустого счёта.');
      } else {
        setError(err.message);
      }
    },
  });

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (openingDone) return;

    const filled = rows.filter(isOpeningRowFilled);
    if (filled.length === 0) {
      setError('Заполните хотя бы одну позицию: актив, количество и среднюю цену.');
      return;
    }

    for (const r of filled) {
      if (!r.incomeGross.trim()) continue;
      const prec = r.asset ? precisionForType(r.asset.type) : precisionForAccount(accountType);
      const grossMinor = toMinorUnits(r.incomeGross, prec);
      const taxMinor = r.incomeTax.trim() !== '' ? toMinorUnits(r.incomeTax, prec) : 0;
      if (grossMinor <= 0) {
        setError('Сумма дохода (gross) должна быть больше нуля — или оставьте поле пустым.');
        return;
      }
      if (taxMinor > grossMinor) {
        setError('Налог не может превышать сумму дохода.');
        return;
      }
    }

    setError(null);
    mutate();
  }

  const moneyPrec = precisionForAccount(accountType);

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className={LABEL}>
        Дата начала ведения
        <input className={FIELD} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </label>

      <div className="flex flex-col gap-3">
        {rows.map((row) => {
          const prec = row.asset
            ? precisionForType(row.asset.type)
            : precisionForAccount(accountType);
          const quoteCcy = row.asset?.currency ?? currency;
          const priceMinor = toMinorUnits(row.avgPrice, prec);
          const amountMinor = Math.round(Number(row.quantity) * priceMinor);
          const amount = Number.isFinite(amountMinor)
            ? formatMoney({ amount: amountMinor, currency: quoteCcy }, prec)
            : null;

          const grossMinor = toMinorUnits(row.incomeGross, prec);
          const taxMinor = row.incomeTax.trim() !== '' ? toMinorUnits(row.incomeTax, prec) : 0;
          const netMinor = Math.max(grossMinor - taxMinor, 0);
          const showNet = row.incomeOpen && row.incomeGross.trim() !== '';

          return (
            <div key={row.id} className="rounded border border-edge/50 bg-panel p-3">
              <div className="flex items-start justify-between gap-2">
                <label className={`${LABEL} min-w-0 flex-1`}>
                  Актив
                  <AssetPicker
                    value={row.asset}
                    onChange={(a) => onAssetChange(row.id, a)}
                    accountId={accountId}
                    accountType={accountType}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => removeRow(row.id)}
                  disabled={rows.length === 1 || openingDone}
                  aria-label="Удалить строку"
                  className="mt-5 shrink-0 text-xs text-mute transition-colors hover:text-ghost disabled:opacity-30"
                >
                  ✕
                </button>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-3">
                <label className={LABEL}>
                  Количество
                  <input
                    className={FIELD}
                    type="number"
                    min="0"
                    step="any"
                    value={row.quantity}
                    onChange={(e) => updateRow(row.id, { quantity: e.target.value })}
                    placeholder="0"
                    disabled={openingDone}
                  />
                </label>
                <label className={LABEL}>
                  Средняя цена ({currencySymbol(quoteCcy)})
                  <input
                    className={FIELD}
                    type="number"
                    min="0"
                    step="any"
                    value={row.avgPrice}
                    onChange={(e) => updateRow(row.id, { avgPrice: e.target.value })}
                    placeholder="0.00"
                    disabled={openingDone}
                  />
                </label>
              </div>
              <p className="mt-2 text-right font-mono text-xs text-mute">
                сумма: <span className="text-ghost">{amount ?? '—'}</span>
                {row.asset && quoteCcy !== currency && (
                  <span className="ml-1">→ в {currency} по курсу</span>
                )}
              </p>

              <div className="mt-3 border-t border-edge/40 pt-2">
                <button
                  type="button"
                  onClick={() => updateRow(row.id, { incomeOpen: !row.incomeOpen })}
                  disabled={openingDone}
                  className="text-xs text-cyber transition-colors hover:text-neon disabled:opacity-40"
                >
                  {row.incomeOpen ? '▾ Доход (опционально)' : '▸ Указать доход'}
                </button>

                {row.incomeOpen && (
                  <div className="mt-2 flex flex-col gap-2">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <label className={LABEL}>
                        Тип
                        <select
                          className={FIELD}
                          value={row.incomeType}
                          onChange={(e) =>
                            updateRow(row.id, { incomeType: e.target.value as IncomeEventType })
                          }
                          disabled={openingDone}
                        >
                          {INCOME_TYPE_OPTIONS.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={LABEL}>
                        Gross ({currencySymbol(currency)})
                        <input
                          className={FIELD}
                          type="number"
                          min="0"
                          step="any"
                          value={row.incomeGross}
                          onChange={(e) => updateRow(row.id, { incomeGross: e.target.value })}
                          placeholder="пусто = без дохода"
                          disabled={openingDone}
                        />
                      </label>
                      <label className={LABEL}>
                        Налог
                        <input
                          className={FIELD}
                          type="number"
                          min="0"
                          step="any"
                          value={row.incomeTax}
                          onChange={(e) => updateRow(row.id, { incomeTax: e.target.value })}
                          placeholder="0.00"
                          disabled={openingDone}
                        />
                      </label>
                    </div>
                    {showNet && (
                      <p className="font-mono text-xs text-mute">
                        net:{' '}
                        <span className="text-cyber">
                          {formatMoney({ amount: netMinor, currency }, moneyPrec)}
                        </span>
                        <span className="ml-2 text-mute">
                          в прибыль позиции, не в кэш · дата = начало ведения
                        </span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setRows((prev) => [...prev, newRow()])}
        disabled={openingDone}
        className="rounded border border-cyber/50 px-3 py-1.5 text-sm text-cyber hover:bg-cyber/10 disabled:opacity-40"
      >
        + Добавить позицию
      </button>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {openingDone ? (
        <button
          type="button"
          onClick={() => onSuccess?.()}
          className="rounded bg-neon px-5 py-2.5 text-sm font-semibold text-night transition-colors hover:bg-neon/90"
        >
          Закрыть
        </button>
      ) : (
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-neon px-5 py-2.5 text-sm font-semibold text-night transition-colors hover:bg-neon/90 disabled:opacity-50"
        >
          {isPending ? 'Сохраняю…' : 'Сохранить позиции'}
        </button>
      )}
    </form>
  );
}
