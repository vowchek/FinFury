import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AccountDto,
  AccountType,
  AssetType,
  CreateAccountDto,
  PortfolioAccountDto,
  PortfolioAllocationDto,
  PortfolioDto,
} from '@finfury/contracts';
import { get, post, del } from '../api/client';
import { Hud, HudTag } from '../components/Hud';
import { Modal } from '../components/Modal';
import {
  currencySymbol,
  formatMoney,
  formatPercent,
  formatSignedMoney,
  precisionForAccount,
} from '../lib/money';
import { useAuthStore } from '../store/auth';
import { DISPLAY_CURRENCY_OPTIONS, useDisplayCurrencyStore } from '../store/display-currency';
import { CompositionModal } from '../dashboard/CompositionModal';
import { HistoryModal } from '../dashboard/PortfolioChart';

const FIELD =
  'w-full rounded border border-edge bg-panel px-3 py-2 text-sm text-ghost placeholder:text-mute focus:border-cyber/70 focus:outline-none';

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  [AccountType.BROKER]: 'Брокерский счёт',
  [AccountType.WALLET]: 'Крипто-кошелёк',
  [AccountType.CASH]: 'Наличные / банк',
};

const ACCOUNT_TYPES = Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[];

const CURRENCIES = ['RUB', 'USD', 'EUR'] as const;

const ALLOCATION_META: Record<AssetType, { label: string; color: string }> = {
  [AssetType.STOCK]: { label: 'Акции', color: 'bg-neon' },
  [AssetType.BOND]: { label: 'Облигации', color: 'bg-cyber' },
  [AssetType.FUND]: { label: 'Фонды', color: 'bg-ghost/40' },
  [AssetType.CRYPTO]: { label: 'Крипто', color: 'bg-amber' },
  [AssetType.CASH]: { label: 'Кэш', color: 'bg-edge' },
  [AssetType.FX]: { label: 'FX', color: 'bg-mute' },
};

function formatAllocationPct(pct: number): string {
  return `${pct.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`;
}

function AllocationBar({ allocation }: { allocation: PortfolioAllocationDto[] }) {
  if (allocation.length === 0) return null;
  return (
    <div className="mt-5">
      <p className="font-mono text-xs text-mute">allocation</p>
      <div className="mt-2 flex h-3 overflow-hidden rounded-sm">
        {allocation.map((a) => (
          <span
            key={a.type}
            className={ALLOCATION_META[a.type].color}
            style={{ width: `${a.weightPct}%` }}
            title={`${ALLOCATION_META[a.type].label} ${formatAllocationPct(a.weightPct)}`}
          />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-ghost/70">
        {allocation.map((a) => (
          <li key={a.type} className="flex items-center gap-1.5">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${ALLOCATION_META[a.type].color}`}
              aria-hidden="true"
            />
            {ALLOCATION_META[a.type].label} {formatAllocationPct(a.weightPct)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12.5V9.5" />
      <path d="M5.5 12.5V6.5" />
      <path d="M9 12.5V8" />
      <path d="M12.5 12.5V3.5" />
    </svg>
  );
}

/** HUD-выпадающий список валюты отображения (нативный select на Windows не стилизуется). */
function CurrencySelect() {
  const currency = useDisplayCurrencyStore((s) => s.currency);
  const setCurrency = useDisplayCurrencyStore((s) => s.setCurrency);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Валюта отображения"
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`inline-flex items-center gap-1 rounded border px-2 py-1.5 font-mono text-xs transition-colors focus:outline-none ${
          open
            ? 'border-cyber/60 text-cyber'
            : 'border-edge text-mute hover:border-cyber/60 hover:text-ghost'
        }`}
      >
        <span className="text-ghost">{currency}</span>
        <span
          aria-hidden="true"
          className={`text-[10px] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        >
          ▾
        </span>
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label="Валюта отображения"
          className="absolute right-0 top-full z-30 mt-1.5 min-w-[7.5rem] overflow-hidden rounded border border-edge bg-night py-1 shadow-[0_0_18px_rgba(255,46,136,0.12)]"
        >
          {DISPLAY_CURRENCY_OPTIONS.map((code) => {
            const selected = code === currency;
            return (
              <li key={code} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => {
                    setCurrency(code);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 font-mono text-xs transition-colors ${
                    selected
                      ? 'bg-cyber/10 text-cyber'
                      : 'text-ghost hover:bg-panel hover:text-cyber'
                  }`}
                >
                  <span>{code}</span>
                  <span className={selected ? 'text-cyber/80' : 'text-mute'}>
                    {currencySymbol(code)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function PortfolioCard() {
  const [historyOpen, setHistoryOpen] = useState(false);
  const displayCurrency = useDisplayCurrencyStore((s) => s.currency);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['portfolio', displayCurrency],
    queryFn: () => get<PortfolioDto>(`/portfolio?displayCurrency=${displayCurrency}`),
  });

  const prec = data?.displayPrecision ?? 2;
  const profitPct =
    data && data.totalCostBasis.amount > 0
      ? (data.unrealizedPnl.amount / data.totalCostBasis.amount) * 100
      : null;
  const yesterdayValue = data ? data.totalValue.amount - data.dayChange.amount : 0;
  const dayPct =
    data && data.dayChange.amount !== 0 && yesterdayValue > 0
      ? (data.dayChange.amount / yesterdayValue) * 100
      : null;
  const dayPositive = dayPct !== null && dayPct >= 0;

  return (
    <Hud className="rounded-lg border border-edge bg-panel p-5 shadow-[0_0_20px_rgba(255,46,136,0.12)]">
      <div className="flex items-start justify-between gap-3">
        <HudTag>portfolio.status</HudTag>
        <div className="flex items-center gap-2">
          <CurrencySelect />
          {data && (
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              aria-label="История и детали портфеля"
              className="rounded border border-edge p-1.5 text-mute transition-colors hover:border-cyber/60 hover:text-cyber focus:border-cyber/70 focus:outline-none"
            >
              <ChartIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      {isLoading && <p className="mt-2 text-sm text-mute">Считаю…</p>}
      {isError && <p className="mt-2 text-sm text-red-400">Не удалось загрузить портфель</p>}
      {data && (
        <>
          <div className="mt-4 flex items-baseline justify-between gap-3">
            <p className="text-sm text-mute">Портфель сегодня</p>
            <span
              className={`group relative inline-flex cursor-help items-center gap-1 font-mono text-sm ${
                dayPct === null ? 'text-mute' : dayPositive ? 'text-cyber' : 'text-amber'
              }`}
            >
              {dayPct === null ? (
                <>— / день</>
              ) : (
                <>
                  <span aria-hidden="true">{dayPositive ? '▲' : '▼'}</span>
                  {formatPercent(dayPct)} / день
                </>
              )}
              <span
                role="tooltip"
                className="pointer-events-none absolute right-0 top-full z-30 mt-1.5 hidden w-max rounded border border-edge bg-night px-2.5 py-1.5 shadow-lg group-hover:block"
              >
                <span className="text-[10px] uppercase tracking-[0.14em] text-mute">за день</span>
                <span
                  className={`mt-0.5 block font-mono text-sm tabular-nums ${
                    data.dayChange.amount >= 0 ? 'text-cyber' : 'text-amber'
                  }`}
                >
                  {formatSignedMoney(data.dayChange, prec)}
                </span>
              </span>
            </span>
          </div>
          <p className="group relative mt-3 w-fit cursor-help font-mono text-3xl font-medium tracking-tight text-ghost sm:text-4xl">
            <span className="glitch">{formatMoney(data.totalValue, prec)}</span>
            <span
              role="tooltip"
              className="pointer-events-none absolute left-0 top-full z-30 mt-1.5 hidden whitespace-nowrap rounded border border-edge bg-night px-2 py-1 text-xs font-normal normal-case tracking-normal shadow-lg group-hover:block"
            >
              <span
                className={`font-mono tabular-nums ${
                  data.unrealizedPnl.amount >= 0 ? 'text-cyber' : 'text-amber'
                }`}
              >
                {formatSignedMoney(data.unrealizedPnl, prec)}
                {profitPct !== null && (
                  <span className="text-mute"> ({formatPercent(profitPct)})</span>
                )}
              </span>
            </span>
          </p>

          <AllocationBar allocation={data.allocation ?? []} />

          <HistoryModal
            open={historyOpen}
            onClose={() => setHistoryOpen(false)}
            summary={{
              totalValue: data.totalValue,
              totalCostBasis: data.totalCostBasis,
              unrealizedPnl: data.unrealizedPnl,
              profitPct,
              dayChange: data.dayChange,
              dayPct,
              precision: prec,
            }}
          />
        </>
      )}
    </Hud>
  );
}

function AccountsCard() {
  const queryClient = useQueryClient();
  const displayCurrency = useDisplayCurrencyStore((s) => s.currency);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [composition, setComposition] = useState<AccountDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>(AccountType.BROKER);
  const [currency, setCurrency] = useState('RUB');
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (type === AccountType.WALLET && currency !== 'USD') {
      setCurrency('USD');
    }
  }, [type, currency]);

  const accounts = useQuery({
    queryKey: ['accounts'],
    queryFn: () => get<AccountDto[]>('/accounts'),
  });

  const portfolio = useQuery({
    queryKey: ['portfolio', displayCurrency],
    queryFn: () => get<PortfolioDto>(`/portfolio?displayCurrency=${displayCurrency}`),
  });

  const create = useMutation({
    mutationFn: () => {
      const dto: CreateAccountDto = {
        name,
        type,
        currency: type === AccountType.WALLET ? 'USD' : currency,
      };
      return post<AccountDto>('/accounts', dto);
    },
    onSuccess: (account) => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      queryClient.invalidateQueries({ queryKey: ['history'] });
      setExpandedId(account.id);
      setCreating(false);
      setName('');
      setError(null);
    },
    onError: (err: Error) => setError(err.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => del<void>(`/accounts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      queryClient.invalidateQueries({ queryKey: ['history'] });
      setConfirmDeleteId(null);
      setDeleteError(null);
      setExpandedId(null);
    },
    onError: (err: Error) => setDeleteError(err.message),
  });

  const list = accounts.data ?? [];
  const byAccount = new Map<string, PortfolioAccountDto>();
  for (const a of portfolio.data?.accounts ?? []) byAccount.set(a.account.id, a);
  const currencyOptions = type === AccountType.WALLET ? (['USD'] as const) : CURRENCIES;

  return (
    <Hud className="rounded-lg border border-edge bg-panel p-5">
      <HudTag>accounts.list</HudTag>
      <div className="mt-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-xl text-ghost">Портфели</h2>
        <button
          type="button"
          onClick={() => setCreating(true)}
          aria-label="Новый счёт"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-cyber/50 text-lg leading-none text-cyber transition-colors hover:bg-cyber/10"
        >
          +
        </button>
      </div>

      {accounts.isLoading && <p className="mt-2 text-sm text-mute">Загружаю…</p>}
      {accounts.isError && <p className="mt-2 text-sm text-red-400">Не удалось загрузить счета</p>}

      {list.length > 0 && (
        <div className="mt-3 flex flex-col gap-3">
          {list.map((a) => {
            const p = byAccount.get(a.id);
            const value = p?.totalValue;
            const cost = p?.totalCostBasis;
            const dayChange = p?.dayChange;
            const prec = precisionForAccount(a.type);
            const yesterdayValue = value && dayChange ? value.amount - dayChange.amount : 0;
            const dayPct =
              dayChange && dayChange.amount !== 0 && yesterdayValue > 0
                ? (dayChange.amount / yesterdayValue) * 100
                : null;
            const open = expandedId === a.id;
            return (
              <div key={a.id} className="account-card rounded-lg border border-edge/60 bg-panel/50">
                <span className="account-card-corner tl" aria-hidden="true" />
                <span className="account-card-corner tr" aria-hidden="true" />
                <span className="account-card-corner bl" aria-hidden="true" />
                <span className="account-card-corner br" aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => setExpandedId(open ? null : a.id)}
                  aria-expanded={open}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left font-mono text-sm transition-colors hover:bg-panel"
                >
                  <span className="text-ghost">{a.name}</span>
                  <span className="flex items-center gap-3">
                    <span className="whitespace-nowrap text-right text-ghost">
                      {value ? formatMoney(value, prec) : '—'}
                    </span>
                  </span>
                </button>
                <div
                  className={`grid transition-all duration-300 ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
                >
                  <div className="overflow-hidden">
                    <div className="px-3 py-2.5">
                      <div className="flex flex-col gap-1 font-mono text-sm">
                        <span className="flex items-center justify-between">
                          <span className="text-mute">внесено</span>
                          <span className="whitespace-nowrap text-ghost">
                            {cost ? formatMoney(cost, prec) : '—'}
                          </span>
                        </span>
                        <span className="flex items-center justify-between">
                          <span className="text-mute">изменение за день</span>
                          <span
                            className={`whitespace-nowrap ${
                              dayChange && dayChange.amount >= 0 ? 'text-cyber' : 'text-amber'
                            }`}
                          >
                            {dayChange ? formatSignedMoney(dayChange, prec) : '—'}
                            {dayPct !== null && (
                              <span className="text-mute"> ({formatPercent(dayPct)})</span>
                            )}
                          </span>
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setComposition(a)}
                          className="rounded border border-cyber/50 px-2 py-1 text-xs text-cyber transition-colors hover:bg-cyber/10"
                        >
                          Состав
                        </button>
                        {confirmDeleteId === a.id ? (
                          <span className="flex items-center gap-2 rounded border border-red-400/60 bg-red-400/10 px-2 py-1">
                            <span className="text-xs text-red-400">
                              Удалить счёт? Данные будут удалены безвозвратно.
                            </span>
                            <button
                              type="button"
                              onClick={() => remove.mutate(a.id)}
                              disabled={remove.isPending}
                              className="rounded bg-red-400 px-2 py-1 text-xs font-semibold text-night hover:bg-red-400/90 disabled:opacity-50"
                            >
                              {remove.isPending ? 'Удаляю…' : 'Удалить'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmDeleteId(null);
                                setDeleteError(null);
                              }}
                              className="rounded border border-edge px-2 py-1 text-xs text-mute hover:text-ghost"
                            >
                              Отмена
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteError(null);
                              setConfirmDeleteId(a.id);
                            }}
                            className="rounded border border-red-400/50 px-2 py-1 text-xs text-red-400 transition-colors hover:bg-red-400/10"
                          >
                            Удалить
                          </button>
                        )}
                      </div>
                      {deleteError && confirmDeleteId === a.id && (
                        <p className="mt-2 text-xs text-red-400">{deleteError}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {list.length === 0 && !accounts.isLoading && (
        <p className="mt-2 text-sm text-mute">Портфелей нет — создайте первый.</p>
      )}

      <div className="mt-4">
        {creating && (
          <Modal tag="accounts.create" title="Новый счёт" onClose={() => setCreating(false)}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                create.mutate();
              }}
              className="flex flex-col gap-3"
            >
              <input
                className={FIELD}
                placeholder="Название (напр. Брокерский)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs text-mute">
                  Тип
                  <select
                    className={FIELD}
                    value={type}
                    onChange={(e) => setType(e.target.value as AccountType)}
                  >
                    {ACCOUNT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {ACCOUNT_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs text-mute">
                  Валюта
                  <select
                    className={FIELD}
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    disabled={type === AccountType.WALLET}
                  >
                    {currencyOptions.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {type === AccountType.WALLET && (
                <p className="text-[11px] text-mute">Крипто-кошелёк всегда в USD.</p>
              )}
              {error && <p className="text-sm text-red-400">{error}</p>}
              <div className="flex justify-end gap-2">
                <button
                  type="submit"
                  disabled={create.isPending}
                  className="rounded bg-neon px-4 py-2 text-sm font-semibold text-night hover:bg-neon/90 disabled:opacity-50"
                >
                  {create.isPending ? 'Создаю…' : 'Создать'}
                </button>
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="rounded border border-edge px-4 py-2 text-sm text-mute hover:text-ghost"
                >
                  Отмена
                </button>
              </div>
            </form>
          </Modal>
        )}
      </div>

      {composition && (
        <CompositionModal account={composition} onClose={() => setComposition(null)} />
      )}
    </Hud>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const auth = useAuthStore();
  const queryClient = useQueryClient();

  function logout() {
    auth.clear();
    queryClient.clear();
    navigate('/login');
  }

  return (
    <div className="flex min-h-screen flex-col bg-night font-sans text-ghost antialiased">
      <div className="scanlines" aria-hidden="true" />
      <header className="sticky top-0 z-10 border-b border-edge/70 bg-night/90 backdrop-blur">
        <nav className="mx-auto flex max-w-page items-center justify-between px-6 py-4">
          <Link to="/dashboard" className="font-display text-xl tracking-wide text-ghost">
            Fin<span className="text-neon">Fury</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="font-mono text-mute">{auth.user?.email}</span>
            <button
              type="button"
              onClick={logout}
              className="rounded border border-edge px-3 py-1.5 text-sm text-mute hover:border-neon/60 hover:text-ghost"
            >
              Выйти
            </button>
          </div>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-app flex-1 flex-col gap-5 px-4 pt-8">
        <PortfolioCard />
        <AccountsCard />
      </main>

      <footer className="mt-10 border-t border-edge/70 bg-night/60">
        <div className="mx-auto flex max-w-page flex-wrap items-center justify-between gap-2 px-6 py-4 font-mono text-xs text-mute">
          <span>
            <span className="text-cyber/70">//</span> finfury · личные финансы
          </span>
          <span>данные хранятся локально · v0.1</span>
        </div>
      </footer>
    </div>
  );
}
