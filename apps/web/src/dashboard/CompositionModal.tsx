import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { AccountDto, IncomeEventDto, Money, PositionDto, TransactionDto } from '@finfury/contracts';
import { get } from '../api/client';
import { HudTag } from '../components/Hud';
import { Modal } from '../components/Modal';
import { formatMoney, formatPercent, formatSignedMoney, precisionForAccount } from '../lib/money';
import { netContributionsAmount } from '../lib/contributions';
import { calculateCashBreakdown } from '../lib/cash-breakdown';
import { transactionTypeLabel } from '../lib/transaction-types';
import { IncomeForm } from './IncomeForm';
import { IncomeList } from './IncomeList';
import { LotsModal } from './LotsModal';
import { OpeningForm } from './OpeningForm';
import { PositionsTable } from './PositionsTable';
import { HistoryReveal } from './PortfolioChart';
import { TransactionForm } from './TransactionForm';

interface CompositionModalProps {
  account: AccountDto;
  onClose: () => void;
}

/** Модалка «Состав»: сводка, позиции; действия — просмотр и ввод отдельными рядами. */
export function CompositionModal({ account, onClose }: CompositionModalProps) {
  const [openingOpen, setOpeningOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const [incomeFormOpen, setIncomeFormOpen] = useState(false);
  const [incomeListOpen, setIncomeListOpen] = useState(false);
  const [lotsOpen, setLotsOpen] = useState(false);

  const positions = useQuery({
    queryKey: ['positions', account.id],
    queryFn: () => get<PositionDto[]>(`/accounts/${account.id}/positions`),
  });
  const transactions = useQuery({
    queryKey: ['transactions', account.id],
    queryFn: () => get<TransactionDto[]>(`/accounts/${account.id}/transactions`),
  });
  const income = useQuery({
    queryKey: ['income', account.id],
    queryFn: () => get<IncomeEventDto[]>(`/income?accountId=${account.id}`),
  });

  const incomeByAsset = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of income.data ?? []) {
      map.set(e.assetId, (map.get(e.assetId) ?? 0) + e.netAmount.amount);
    }
    return map;
  }, [income.data]);

  const cashBreakdown = useMemo(() => {
    const taxWithheld = (income.data ?? []).reduce(
      (sum, e) => sum + (e.taxWithheld?.amount ?? 0),
      0,
    );
    return calculateCashBreakdown(
      (transactions.data ?? []).map((t) => ({
        type: t.type,
        amount: t.amount.amount,
        fee: t.fee?.amount,
      })),
      taxWithheld,
    );
  }, [transactions.data, income.data]);

  // Precision для сумм счёта: WALLET = 6 (крипта), остальные = 2.
  const prec = precisionForAccount(account.type);

  // Сводка: взносы (net contributions) + стоимость позиций включая синтетический кэш с API.
  // Изменение = стоимость − взносы (доходный кэш входит в стоимость, не во взносы).
  const contributionsAmount = netContributionsAmount(transactions.data ?? []);
  const valueAmount = Math.round(
    (positions.data ?? []).reduce((sum, p) => sum + (p.currentValue?.amount ?? 0), 0),
  );
  const changeAmount = valueAmount - contributionsAmount;
  const pct =
    contributionsAmount > 0 ? (changeAmount / contributionsAmount) * 100 : null;
  const contributions: Money = { amount: contributionsAmount, currency: account.currency };
  const value: Money = { amount: valueAmount, currency: account.currency };
  const change: Money = { amount: changeAmount, currency: account.currency };

  // dayChange из позиций (валюта счёта) — не из portfolio display currency
  const dayChangeAmount = Math.round(
    (positions.data ?? []).reduce((sum, p) => sum + (p.dayChange?.amount ?? 0), 0),
  );
  const dayChange: Money | undefined = positions.data
    ? { amount: dayChangeAmount, currency: account.currency }
    : undefined;
  const yesterdayValue = dayChange ? valueAmount - dayChange.amount : 0;
  const dayPct =
    dayChange && dayChange.amount !== 0 && yesterdayValue > 0
      ? (dayChange.amount / yesterdayValue) * 100
      : null;

  // Snapshot одноразовый (бэкенд-гард 409): «+ Добавить позиции» показываем
  // только пока у счёта нет ни одной транзакции.
  const hasTransactions = (transactions.data?.length ?? 0) > 0;

  const symbolOf = new Map<string, string>();
  for (const p of positions.data ?? []) symbolOf.set(p.assetId, p.asset.symbol);

  return (
    <Modal
      tag="account.composition"
      title={`Состав · ${account.name}`}
      onClose={onClose}
      className="max-w-5xl"
      closeOnEscape={!openingOpen && !formOpen && !bookOpen && !incomeFormOpen && !incomeListOpen && !lotsOpen}
    >
      {/* Сводка */}
      <div className="flex flex-col gap-1 font-mono text-sm">
        <span className="flex items-center justify-between">
          <span className="text-mute">взносы</span>
          <span className="text-ghost">{formatMoney(contributions, prec)}</span>
        </span>
        <span className="flex items-center justify-between">
          <span className="text-mute">стоимость</span>
          <span className="text-ghost">{formatMoney(value, prec)}</span>
        </span>
        <span className="flex items-center justify-between">
          <span className="text-mute">изменение</span>
          <span className={`whitespace-nowrap ${changeAmount >= 0 ? 'text-cyber' : 'text-amber'}`}>
            {transactions.isLoading ? '…' : formatSignedMoney(change, prec)}
            {pct !== null && <span className="text-mute"> ({formatPercent(pct)})</span>}
          </span>
        </span>
        <span className="flex items-center justify-between">
          <span className="text-mute">изменение за день</span>
          <span className={`whitespace-nowrap ${dayChange && dayChange.amount >= 0 ? 'text-cyber' : 'text-amber'}`}>
            {dayChange ? formatSignedMoney(dayChange, prec) : '—'}
            {dayPct !== null && <span className="text-mute"> ({formatPercent(dayPct)})</span>}
          </span>
        </span>
      </div>
      <HistoryReveal accountId={account.id} label="История" />

      {/* Позиции */}
      <div className="mt-5 border-t border-edge/50 pt-4">
        <HudTag>account.positions</HudTag>
        {positions.isLoading && <p className="mt-2 text-sm text-mute">Считаю позиции…</p>}
        {positions.isError && <p className="mt-2 text-sm text-red-400">Не удалось загрузить позиции</p>}
        {positions.data && positions.data.length === 0 && (
          <p className="mt-2 text-sm text-mute">Позиций нет — добавьте позиции или первую транзакцию.</p>
        )}
        {positions.data && positions.data.length > 0 && (
          <div className="mt-2">
            <PositionsTable
              positions={positions.data}
              incomeByAsset={incomeByAsset}
              cashBreakdown={cashBreakdown}
              currency={account.currency}
              precision={prec}
            />
          </div>
        )}
      </div>

      {/* Действия: просмотр отдельно от ввода — не ломаются в одну узкую строку */}
      <div className="mt-5 flex flex-col gap-3 border-t border-edge/50 pt-4">
        <div>
          <p className="mb-1.5 text-[10px] uppercase tracking-[0.18em] text-mute">просмотр</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setBookOpen(true)}
              className="rounded border border-edge px-3 py-1.5 text-sm text-mute transition-colors hover:border-neon/60 hover:text-ghost"
            >
              Книга
            </button>
            <button
              type="button"
              onClick={() => setIncomeListOpen(true)}
              className="rounded border border-edge px-3 py-1.5 text-sm text-mute transition-colors hover:border-neon/60 hover:text-ghost"
            >
              Доходы
            </button>
            <button
              type="button"
              onClick={() => setLotsOpen(true)}
              className="rounded border border-edge px-3 py-1.5 text-sm text-mute transition-colors hover:border-neon/60 hover:text-ghost"
            >
              Партии
            </button>
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-[10px] uppercase tracking-[0.18em] text-mute">ввод</p>
          <div className="flex flex-wrap gap-2">
            {!hasTransactions && (
              <button
                type="button"
                onClick={() => setOpeningOpen(true)}
                className="rounded border border-neon/50 px-3 py-1.5 text-sm text-neon transition-colors hover:bg-neon/10"
              >
                + Позиции
              </button>
            )}
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="rounded border border-cyber/50 px-3 py-1.5 text-sm text-cyber transition-colors hover:bg-cyber/10"
            >
              + Транзакция
            </button>
            <button
              type="button"
              onClick={() => setIncomeFormOpen(true)}
              className="rounded border border-cyber/50 px-3 py-1.5 text-sm text-cyber transition-colors hover:bg-cyber/10"
            >
              + Доход
            </button>
          </div>
        </div>
      </div>

      {openingOpen && (
        <Modal
          tag="mode.a"
          title="Добавить позиции"
          onClose={() => setOpeningOpen(false)}
          className="max-w-lg"
        >
          <OpeningForm
            accountId={account.id}
            currency={account.currency}
            accountType={account.type}
            onSuccess={() => setOpeningOpen(false)}
          />
        </Modal>
      )}

      {formOpen && (
        <Modal tag="book.append" title="Новая транзакция" onClose={() => setFormOpen(false)}>
          <TransactionForm
            accountId={account.id}
            currency={account.currency}
            accountType={account.type}
            onSuccess={() => setFormOpen(false)}
          />
        </Modal>
      )}

      {bookOpen && (
        <BookModal account={account} symbolOf={symbolOf} onClose={() => setBookOpen(false)} />
      )}

      {incomeFormOpen && (
        <Modal tag="income.create" title="Доход" onClose={() => setIncomeFormOpen(false)}>
          <IncomeForm
            accountId={account.id}
            currency={account.currency}
            accountType={account.type}
            onSuccess={() => setIncomeFormOpen(false)}
          />
        </Modal>
      )}

      {incomeListOpen && (
        <IncomeList accountId={account.id} accountName={account.name} onClose={() => setIncomeListOpen(false)} />
      )}

      {lotsOpen && (
        <LotsModal
          accountId={account.id}
          accountName={account.name}
          accountType={account.type}
          onClose={() => setLotsOpen(false)}
        />
      )}
    </Modal>
  );
}

/** Фрейм «Книга»: транзакции счёта отдельной модалкой. */
function BookModal({
  account,
  symbolOf,
  onClose,
}: {
  account: AccountDto;
  symbolOf: Map<string, string>;
  onClose: () => void;
}) {
  const transactions = useQuery({
    queryKey: ['transactions', account.id],
    queryFn: () => get<TransactionDto[]>(`/accounts/${account.id}/transactions`),
  });
  const prec = precisionForAccount(account.type);

  return (
    <Modal tag="book.ledger" title={`Книга · ${account.name}`} onClose={onClose} className="max-w-2xl">
      {transactions.isLoading && <p className="text-sm text-mute">Загружаю…</p>}
      {transactions.isError && <p className="text-sm text-red-400">Не удалось загрузить транзакции</p>}
      {transactions.data && transactions.data.length === 0 && (
        <p className="text-sm text-mute">Пока пусто.</p>
      )}
      {transactions.data && transactions.data.length > 0 && (
        <ul className="flex flex-col gap-1.5 font-mono text-sm">
          {transactions.data.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-2 rounded border border-edge/40 bg-panel px-2.5 py-1.5"
            >
              <span className="text-mute">
                {t.date} <span className="text-ghost">{transactionTypeLabel(t.type)}</span>
                {t.assetId && symbolOf.get(t.assetId) && (
                  <span className="text-cyber"> {symbolOf.get(t.assetId)}</span>
                )}
                {t.quantity !== undefined && <span className="text-mute"> ×{t.quantity}</span>}
              </span>
              <span className="text-ghost">{formatMoney(t.amount, prec)}</span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}