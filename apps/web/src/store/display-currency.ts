import { create } from 'zustand';
import { DisplayCurrencyCode } from '@finfury/contracts';
import { useAuthStore } from './auth';

const KEY = 'finfury.displayCurrency';
const ALLOWED: DisplayCurrencyCode[] = ['RUB', 'USD', 'EUR'];

function parse(raw: string | null): DisplayCurrencyCode | null {
  if (!raw) return null;
  const code = raw.toUpperCase();
  return ALLOWED.includes(code as DisplayCurrencyCode) ? (code as DisplayCurrencyCode) : null;
}

function defaultFromUser(): DisplayCurrencyCode {
  const base = useAuthStore.getState().user?.baseCurrency?.toUpperCase();
  if (base && ALLOWED.includes(base as DisplayCurrencyCode)) {
    return base as DisplayCurrencyCode;
  }
  return 'RUB';
}

function load(): DisplayCurrencyCode {
  try {
    return parse(localStorage.getItem(KEY)) ?? defaultFromUser();
  } catch {
    return defaultFromUser();
  }
}

interface DisplayCurrencyState {
  currency: DisplayCurrencyCode;
  setCurrency: (currency: DisplayCurrencyCode) => void;
}

/** Валюта отображения дашборда (ADR-009). Persist в localStorage; дефолт — User.baseCurrency. */
export const useDisplayCurrencyStore = create<DisplayCurrencyState>((set) => ({
  currency: load(),
  setCurrency: (currency) => {
    localStorage.setItem(KEY, currency);
    set({ currency });
  },
}));

export const DISPLAY_CURRENCY_OPTIONS: DisplayCurrencyCode[] = ALLOWED;
