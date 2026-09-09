import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthResponseDto } from '@finfury/contracts';
import { post } from '../api/client';
import { scheduleProactiveRefresh } from '../api/session';
import { Hud, HudTag } from '../components/Hud';
import { useAuthStore } from '../store/auth';

type Mode = 'login' | 'register';

const FIELD =
  'w-full rounded border border-edge bg-panel px-3 py-2 text-sm text-ghost placeholder:text-mute focus:border-cyber/70 focus:outline-none';

export function LoginPage() {
  const navigate = useNavigate();
  const auth = useAuthStore();
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { mutate, isPending } = useMutation({
    mutationFn: async (): Promise<AuthResponseDto> => {
      const path = mode === 'login' ? '/auth/login' : '/auth/register';
      const body = mode === 'login' ? { email, password } : { email, password, name };
      return post<AuthResponseDto>(path, body);
    },
    onSuccess: (res) => {
      auth.setSession(res.accessToken, res.refreshToken, res.user);
      scheduleProactiveRefresh();
      navigate('/dashboard');
    },
    onError: (err: Error) => setError(err.message),
  });

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    auth.clear();
    mutate();
  }

  return (
    <div className="min-h-screen bg-night font-sans text-ghost antialiased">
      <div className="scanlines" aria-hidden="true" />
      <header className="border-b border-edge/70">
        <nav className="mx-auto flex max-w-page items-center justify-between px-6 py-4">
          <Link to="/" className="font-display text-xl tracking-wide text-ghost">
            Fin<span className="text-neon">Fury</span>
          </Link>
        </nav>
      </header>

      <main className="mx-auto flex max-w-app flex-col px-4 pt-12">
        <Hud className="rounded-lg border border-edge bg-panel p-6 shadow-[0_0_20px_rgba(47,224,255,0.12)]">
          <HudTag>auth.access</HudTag>
          <h1 className="mt-4 font-display text-2xl tracking-tight text-ghost">
            {mode === 'login' ? 'Вход в книгу' : 'Новый доступ'}
          </h1>

          <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
            {mode === 'register' && (
              <input
                className={FIELD}
                placeholder="Имя"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            )}
            <input
              className={FIELD}
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
            <input
              className={FIELD}
              type="password"
              placeholder="Пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={mode === 'register' ? 8 : undefined}
              required
            />

            {error && <p className="text-sm text-red-400">{error}</p>}
            {!error && auth.sessionMessage && (
              <p className="text-sm text-amber-400">{auth.sessionMessage}</p>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="rounded bg-neon px-5 py-2.5 text-sm font-semibold text-night transition-colors hover:bg-neon/90 disabled:opacity-50"
            >
              {isPending ? 'Секунду…' : mode === 'login' ? 'Войти' : 'Создать доступ'}
            </button>
          </form>

          <button
            type="button"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError(null);
            }}
            className="mt-6 text-sm text-cyber hover:text-ghost"
          >
            {mode === 'login' ? 'Нет доступа? Зарегистрироваться' : 'Уже есть доступ? Войти'}
          </button>
        </Hud>
      </main>
    </div>
  );
}