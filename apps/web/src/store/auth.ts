import { create } from 'zustand';
import { UserDto } from '@finfury/contracts';

/**
 * Сессия пользователя. Пара токенов (access + refresh) и профиль хранятся
 * в localStorage, чтобы переживать перезагрузку страницы. Токены не логируем
 * и не выводим в UI. Refresh-токен нужен для silent refresh при 401
 * (см. `api/client.ts` и `api/session.ts`).
 */
interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: UserDto | null;
  /** Сообщение для страницы входа (например, «сессия истекла»). */
  sessionMessage: string | null;
  setSession: (accessToken: string, refreshToken: string, user: UserDto) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  clear: (message?: string) => void;
}

const TOKEN_KEY = 'finfury.accessToken';
const REFRESH_KEY = 'finfury.refreshToken';
const USER_KEY = 'finfury.user';

function loadUser(): UserDto | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as UserDto) : null;
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: localStorage.getItem(TOKEN_KEY),
  refreshToken: localStorage.getItem(REFRESH_KEY),
  user: loadUser(),
  sessionMessage: null,
  setSession: (accessToken, refreshToken, user) => {
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    set({ accessToken, refreshToken, user, sessionMessage: null });
  },
  setTokens: (accessToken, refreshToken) => {
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
    set({ accessToken, refreshToken });
  },
  clear: (message) => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
    set({ accessToken: null, refreshToken: null, user: null, sessionMessage: message ?? null });
  },
}));