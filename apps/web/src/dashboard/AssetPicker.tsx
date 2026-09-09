import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { AccountType, AssetDto, AssetType } from '@finfury/contracts';
import { get, post } from '../api/client';

const FIELD =
  'w-full rounded border border-edge bg-panel px-3 py-2 text-sm text-ghost placeholder:text-mute focus:border-cyber/70 focus:outline-none';

/** Результат поиска во внешнем источнике (бэкенд → /assets/external). */
interface ExternalAssetResult {
  symbol: string;
  name: string;
  type: AssetType;
  currency: string;
  isin?: string;
  source: string;
}

/** Типы активов, допустимые для каждого типа счёта. */
const ALLOWED_TYPES: Record<string, AssetType[]> = {
  [AccountType.BROKER]: [AssetType.STOCK, AssetType.BOND, AssetType.FUND],
  [AccountType.WALLET]: [AssetType.CRYPTO],
  [AccountType.CASH]: [],
};

interface AssetPickerProps {
  value: AssetDto | null;
  onChange: (asset: AssetDto | null) => void;
  /** ID счёта для внешнего поиска (опционально). */
  accountId?: string;
  /** Тип счёта для фильтрации активов (опционально). */
  accountType?: AccountType;
}

/**
 * Поиск актива: при вводе — подсказки из локального справочника (БД),
 * отфильтрованные по типу счёта (ценные бумаги для брокера, крипта для кошелька).
 * Если не найдено — кнопка для поиска во внешних источниках по клику.
 * При выборе внешнего результата актив авто-создаётся в справочнике.
 */
export function AssetPicker({ value, onChange, accountId, accountType }: AssetPickerProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [externalQuery, setExternalQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const allowedTypes = accountType ? ALLOWED_TYPES[accountType] ?? [] : [];

  // Debounce: при вводе ждём 300ms перед локальным поиском
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value) return;
    debounceRef.current = setTimeout(() => {
      const q = query.trim();
      setDebouncedQuery(q);
      if (q !== externalQuery) setExternalQuery('');
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, value]);

  // Поиск в локальном справочнике
  const localSearch = useQuery({
    queryKey: ['assets-search', debouncedQuery],
    queryFn: () => get<AssetDto[]>(`/assets?q=${encodeURIComponent(debouncedQuery)}`),
    enabled: debouncedQuery.length > 0,
  });

  // Поиск во внешних источниках — только по явному запросу
  const externalSearch = useQuery({
    queryKey: ['assets-external', externalQuery, accountId],
    queryFn: () =>
      get<ExternalAssetResult[]>(
        `/assets/external?q=${encodeURIComponent(externalQuery)}&accountId=${accountId}`,
      ),
    enabled: externalQuery.length >= 2 && !!accountId,
  });

  // Авто-создание актива при выборе из внешних результатов
  const ensureAsset = useMutation({
    mutationFn: (params: { symbol: string; name: string; type: AssetType; currency: string; isin?: string }) =>
      post<AssetDto>('/assets', params),
    onSuccess: (asset) => {
      onChange(asset);
      setQuery('');
      setDebouncedQuery('');
      setExternalQuery('');
    },
  });

  const localResults = (localSearch.data ?? [])
    .filter((a) => allowedTypes.length === 0 || allowedTypes.includes(a.type));
  const externalResults = externalSearch.data ?? [];

  // Внешние результаты, которых ещё нет в локальной БД
  const localSymbols = new Set(localResults.map((a) => a.symbol));
  const uniqueExternal = externalResults.filter((a) => !localSymbols.has(a.symbol));

  const notFound = debouncedQuery.length > 0 && !localSearch.isFetching && localResults.length === 0;

  function handleSelectExternal(r: ExternalAssetResult) {
    ensureAsset.mutate({
      symbol: r.symbol,
      name: r.name,
      type: r.type,
      currency: r.currency,
      isin: r.isin,
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        className={FIELD}
        placeholder="Символ актива (напр. AAPL)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {value && (
        <div className="flex items-center justify-between rounded border border-neon/50 bg-panel px-3 py-1.5 text-sm">
          <span className="font-mono text-ghost">
            {value.symbol} <span className="text-mute">· {value.name}</span>
          </span>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs text-mute hover:text-ghost"
            aria-label="Сбросить актив"
          >
            ✕
          </button>
        </div>
      )}

      {debouncedQuery && !value && (
        <div className="rounded border border-edge bg-panel">
          {localSearch.isFetching && <p className="px-3 py-2 text-sm text-mute">Ищу…</p>}

          {/* Локальные результаты */}
          {localResults.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => {
                onChange(a);
                setQuery('');
                setDebouncedQuery('');
                setExternalQuery('');
              }}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-edge/40"
            >
              <span className="font-mono text-ghost">{a.symbol}</span>
              <span className="text-mute">{a.name}</span>
            </button>
          ))}

          {/* Кнопка внешнего поиска (если локально пусто) */}
          {notFound && !externalQuery && (
            <button
              type="button"
              onClick={() => setExternalQuery(debouncedQuery)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-cyber hover:bg-edge/40"
            >
              <span>Найти во внешних источниках</span>
              <span className="text-xs text-mute">→</span>
            </button>
          )}

          {/* Результаты внешнего поиска */}
          {externalSearch.isFetching && (
            <p className="px-3 py-2 text-sm text-mute">Ищу во внешних источниках…</p>
          )}

          {uniqueExternal.map((r, i) => (
            <button
              key={`ext-${r.source}-${r.symbol}-${i}`}
              type="button"
              onClick={() => handleSelectExternal(r)}
              disabled={ensureAsset.isPending}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-edge/40"
            >
              <span className="font-mono text-ghost">
                {r.symbol}{' '}
                <span className={`text-xs ${
                  r.source === 'moex' ? 'text-cyber' : r.source === 'yahoo' ? 'text-neon' : 'text-yellow-400'
                }`}>
                  [{r.source}]
                </span>
              </span>
              <span className="text-mute">{r.name}</span>
            </button>
          ))}

          {externalQuery && !externalSearch.isFetching && uniqueExternal.length === 0 && (
            <p className="px-3 py-2 text-sm text-mute">Ничего не найдено во внешних источниках</p>
          )}
        </div>
      )}
    </div>
  );
}