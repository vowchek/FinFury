import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserDto } from '@finfury/contracts';
import { useAuthStore } from '../store/auth';

const user: UserDto = {
  id: 'u1',
  email: 'a@b.c',
  name: 'Test',
  baseCurrency: 'RUB',
  createdAt: '2026-01-01T00:00:00Z',
};

vi.mock('./client', () => ({
  refreshOnce: vi.fn(),
}));

import { refreshOnce } from './client';
import { scheduleProactiveRefresh } from './session';

function makeJwt(expSeconds: number): string {
  const header = btoa(JSON.stringify({ alg: 'none' }));
  const payload = btoa(JSON.stringify({ exp: expSeconds }));
  return `${header}.${payload}.sig`;
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  useAuthStore.setState({
    accessToken: null,
    refreshToken: null,
    user: null,
    sessionMessage: null,
  });
  vi.mocked(refreshOnce).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('scheduleProactiveRefresh', () => {
  it('не планирует таймер без access-токена', () => {
    const spy = vi.spyOn(globalThis, 'setTimeout');
    scheduleProactiveRefresh();
    expect(spy).not.toHaveBeenCalled();
  });

  it('невалидный JWT — таймер не ставится', () => {
    useAuthStore.getState().setSession('not-a-jwt', 'refresh', user);
    const spy = vi.spyOn(globalThis, 'setTimeout');
    scheduleProactiveRefresh();
    expect(spy).not.toHaveBeenCalled();
  });

  it('планирует refresh на 80% TTL и при успехе перепланирует', async () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const ttlSec = 100;
    const token = makeJwt(Math.floor(now / 1000) + ttlSec);
    useAuthStore.getState().setSession(token, 'refresh', user);
    vi.mocked(refreshOnce).mockResolvedValue(true);

    scheduleProactiveRefresh();

    const expectedDelay = Math.floor(ttlSec * 1000 * 0.8);
    await vi.advanceTimersByTimeAsync(expectedDelay);

    expect(refreshOnce).toHaveBeenCalledTimes(1);
  });

  it('при неудачном refresh очищает сессию', async () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const token = makeJwt(Math.floor(now / 1000) + 100);
    useAuthStore.getState().setSession(token, 'refresh', user);
    vi.mocked(refreshOnce).mockResolvedValue(false);

    scheduleProactiveRefresh();
    await vi.advanceTimersByTimeAsync(Math.floor(100_000 * 0.8));

    const s = useAuthStore.getState();
    expect(s.accessToken).toBeNull();
    expect(s.sessionMessage).toBe('Сессия истекла. Войдите заново.');
  });

  it('повторный вызов сбрасывает предыдущий таймер', async () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const token = makeJwt(Math.floor(now / 1000) + 100);
    useAuthStore.getState().setSession(token, 'refresh', user);
    vi.mocked(refreshOnce).mockResolvedValue(true);

    scheduleProactiveRefresh();
    scheduleProactiveRefresh();

    await vi.advanceTimersByTimeAsync(Math.floor(100_000 * 0.8));
    expect(refreshOnce).toHaveBeenCalledTimes(1);
  });
});
