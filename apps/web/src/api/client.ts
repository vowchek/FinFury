import { AuthResponseDto } from '@finfury/contracts';
import { useAuthStore } from '../store/auth';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';

/** Ошибка API с HTTP-статусом и человекочитаемым сообщением. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Silent refresh: обновляет пару токенов через `POST /auth/refresh`.
 * Возвращает `true` при успехе. Токены не логируются.
 */
async function doRefresh(): Promise<boolean> {
  const refreshToken = useAuthStore.getState().refreshToken;
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as AuthResponseDto;
    useAuthStore.getState().setTokens(body.accessToken, body.refreshToken);
    return true;
  } catch {
    return false;
  }
}

// Single-flight: несколько одновременных 401 не порождают пачку /auth/refresh —
// все ждут один общий промис.
let refreshPromise: Promise<boolean> | null = null;

export function refreshOnce(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

/** Завершает сессию с сообщением для страницы входа. */
function expireSession(): void {
  useAuthStore.getState().clear('Сессия истекла. Войдите заново.');
}

/**
 * Тонкий fetch-клиент: подставляет Bearer access-токен из сессии,
 * разбирает JSON и нормализует ошибки. 204 → undefined.
 *
 * При 401 один раз обновляет токен в фоне и повторяет исходный запрос.
 * Если refresh не удался — сессия очищается (пользователь уходит на /login).
 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = useAuthStore.getState().accessToken;
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let res = await fetch(`${API_URL}${path}`, { ...init, headers });

  // 401 на login/register — это неверные учётные данные, не протухшая сессия.
  const isAuthCredentialPath =
    path === '/auth/login' || path === '/auth/register' || path === '/auth/refresh';

  if (res.status === 401 && !isAuthCredentialPath) {
    const ok = await refreshOnce();
    if (!ok) {
      expireSession();
      throw new ApiError(401, 'Сессия истекла. Войдите заново.');
    }
    const newToken = useAuthStore.getState().accessToken;
    const retryHeaders = new Headers(init.headers);
    retryHeaders.set('Content-Type', 'application/json');
    if (newToken) retryHeaders.set('Authorization', `Bearer ${newToken}`);
    res = await fetch(`${API_URL}${path}`, { ...init, headers: retryHeaders });
  }

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const raw = body?.message;
    const message = Array.isArray(raw) ? raw.join(', ') : raw ?? `Ошибка ${res.status}`;
    throw new ApiError(res.status, message);
  }
  return body as T;
}

export function get<T>(path: string): Promise<T> {
  return api<T>(path);
}

export function post<T>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

export function patch<T>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
}

export function del<T>(path: string): Promise<T> {
  return api<T>(path, { method: 'DELETE' });
}