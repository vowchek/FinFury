import { beforeEach, describe, expect, it } from 'vitest';
import { UserDto } from '@finfury/contracts';
import { useAuthStore } from './auth';

const user: UserDto = {
  id: 'u1',
  email: 'a@b.c',
  name: 'Test',
  baseCurrency: 'RUB',
  createdAt: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState({
    accessToken: null,
    refreshToken: null,
    user: null,
    sessionMessage: null,
  });
});

describe('useAuthStore', () => {
  it('setSession сохраняет пару токенов и профиль', () => {
    useAuthStore.getState().setSession('access', 'refresh', user);

    const s = useAuthStore.getState();
    expect(s.accessToken).toBe('access');
    expect(s.refreshToken).toBe('refresh');
    expect(s.user).toEqual(user);
    expect(s.sessionMessage).toBeNull();
    expect(localStorage.getItem('finfury.accessToken')).toBe('access');
    expect(localStorage.getItem('finfury.refreshToken')).toBe('refresh');
  });

  it('setTokens обновляет только пару токенов', () => {
    useAuthStore.getState().setSession('access', 'refresh', user);
    useAuthStore.getState().setTokens('access2', 'refresh2');

    const s = useAuthStore.getState();
    expect(s.accessToken).toBe('access2');
    expect(s.refreshToken).toBe('refresh2');
    expect(s.user).toEqual(user);
  });

  it('clear удаляет токены и профиль, ставит сообщение', () => {
    useAuthStore.getState().setSession('access', 'refresh', user);
    useAuthStore.getState().clear('Сессия истекла');

    const s = useAuthStore.getState();
    expect(s.accessToken).toBeNull();
    expect(s.refreshToken).toBeNull();
    expect(s.user).toBeNull();
    expect(s.sessionMessage).toBe('Сессия истекла');
    expect(localStorage.getItem('finfury.refreshToken')).toBeNull();
  });

  it('clear без сообщения не оставляет sessionMessage', () => {
    useAuthStore.getState().setSession('access', 'refresh', user);
    useAuthStore.getState().clear();

    expect(useAuthStore.getState().sessionMessage).toBeNull();
  });

  it('принимает пустые токены (edge) без падения', () => {
    useAuthStore.getState().setSession('', '', user);

    expect(useAuthStore.getState().accessToken).toBe('');
    expect(useAuthStore.getState().refreshToken).toBe('');
  });
});