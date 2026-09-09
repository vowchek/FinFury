import { useAuthStore } from '../store/auth';
import { refreshOnce } from './client';

/**
 * Проактивный (sliding) refresh: до истечения access-токена в фоне обновляем
 * пару токенов, чтобы пользователь не попадал в 401 и не видел «протухание».
 * Срабатывает на 80% времени жизни access-токена (по `exp` из JWT).
 */

let timer: ReturnType<typeof setTimeout> | null = null;

/** Декодирует `exp` (unix-секунды) из JWT без проверки подписи. */
function decodeExp(token: string): number | null {
  try {
    const [, payloadB64] = token.split('.');
    const payload = JSON.parse(
      atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')),
    );
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

/**
 * Планирует refresh на 80% времени жизни текущего access-токена.
 * Безопасно вызывать повторно: предыдущий таймер сбрасывается.
 */
export function scheduleProactiveRefresh(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const token = useAuthStore.getState().accessToken;
  if (!token) return;
  const exp = decodeExp(token);
  if (!exp) return;
  const ttlMs = exp * 1000 - Date.now();
  if (ttlMs <= 0) return;

  const delay = Math.max(0, Math.floor(ttlMs * 0.8));
  timer = setTimeout(async () => {
    timer = null;
    const ok = await refreshOnce();
    if (ok) {
      scheduleProactiveRefresh();
    } else {
      useAuthStore.getState().clear('Сессия истекла. Войдите заново.');
    }
  }, delay);
}