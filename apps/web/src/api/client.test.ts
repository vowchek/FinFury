import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserDto } from '@finfury/contracts';
import { useAuthStore } from '../store/auth';
import { api, ApiError } from './client';

const API_URL = 'http://localhost:3000/api/v1';

const user: UserDto = {
  id: 'u1',
  email: 'a@b.c',
  name: 'Test',
  baseCurrency: 'RUB',
  createdAt: '2026-01-01T00:00:00Z',
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState({
    accessToken: null,
    refreshToken: null,
    user: null,
    sessionMessage: null,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('api / silent refresh', () => {
  it('при 401 обновляет токен и повторяет исходный запрос', async () => {
    useAuthStore.getState().setSession('old-access', 'refresh-token', user);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { message: 'Unauthorized' }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          accessToken: 'new-access',
          refreshToken: 'new-refresh',
          user,
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const data = await api<{ ok: boolean }>('/data');

    expect(data).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // refresh-запрос
    const refreshCall = fetchMock.mock.calls[1];
    expect(refreshCall[0]).toBe(`${API_URL}/auth/refresh`);
    expect(refreshCall[1].method).toBe('POST');
    expect(JSON.parse(refreshCall[1].body)).toEqual({ refreshToken: 'refresh-token' });

    // повтор исходного запроса с новым токеном
    const replayHeaders = new Headers(fetchMock.mock.calls[2][1].headers);
    expect(replayHeaders.get('Authorization')).toBe('Bearer new-access');

    expect(useAuthStore.getState().accessToken).toBe('new-access');
    expect(useAuthStore.getState().refreshToken).toBe('new-refresh');
  });

  it('single-flight: параллельные 401 дают один /auth/refresh', async () => {
    useAuthStore.getState().setSession('old-access', 'refresh-token', user);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          accessToken: 'new-access',
          refreshToken: 'new-refresh',
          user,
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const [a, b] = await Promise.all([api('/a'), api('/b')]);

    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });

    const refreshCalls = fetchMock.mock.calls.filter(
      (c) => c[0] === `${API_URL}/auth/refresh`,
    );
    expect(refreshCalls).toHaveLength(1);
  });

  it('при неудачном refresh очищает сессию и бросает ApiError', async () => {
    useAuthStore.getState().setSession('old-access', 'refresh-token', user);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(jsonResponse(401, { message: 'bad refresh' }));
    vi.stubGlobal('fetch', fetchMock);

    const err = await api('/data').catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(401);
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().refreshToken).toBeNull();
    expect(useAuthStore.getState().sessionMessage).toBeTruthy();
  });

  it('без refresh-токена не вызывает /auth/refresh и очищает сессию', async () => {
    useAuthStore.getState().setSession('old-access', '', user);

    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(401, {}));
    vi.stubGlobal('fetch', fetchMock);

    const err = await api('/data').catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    const refreshCalls = fetchMock.mock.calls.filter(
      (c) => c[0] === `${API_URL}/auth/refresh`,
    );
    expect(refreshCalls).toHaveLength(0);
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('не трогает /auth/refresh при 401 (нет рекурсии)', async () => {
    useAuthStore.getState().setSession('old-access', 'refresh-token', user);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { message: 'bad refresh' }));
    vi.stubGlobal('fetch', fetchMock);

    const err = await api('/auth/refresh').catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('при 401 на /auth/login не делает refresh и отдаёт сообщение сервера', async () => {
    useAuthStore.getState().setSession('old-access', 'refresh-token', user);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { message: 'Неверный email или пароль' }));
    vi.stubGlobal('fetch', fetchMock);

    const err = await api('/auth/login', { method: 'POST', body: '{}' }).catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe('Неверный email или пароль');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Сессию login не очищает сам api — это делает форма при submit.
    expect(useAuthStore.getState().accessToken).toBe('old-access');
  });
});