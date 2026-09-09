import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { AuthService } from './auth.service';

const USER = {
  id: 'u1',
  email: 'a@b.c',
  name: 'Test',
  baseCurrency: 'RUB',
  passwordHash: bcrypt.hashSync('secret', 4),
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

function buildService(overrides: { user?: object | null } = {}) {
  const users = {
    findOne: vi.fn(async () => (overrides.user === undefined ? USER : overrides.user)),
    create: vi.fn((input: object) => input),
    save: vi.fn(async (row: object) => ({ ...USER, ...row })),
  };
  const config = {
    get: vi.fn((key: string) => {
      const map: Record<string, string> = {
        JWT_ACCESS_SECRET: 'access-secret',
        JWT_REFRESH_SECRET: 'refresh-secret',
        JWT_ACCESS_TTL: '15m',
        JWT_REFRESH_TTL: '30d',
      };
      return map[key];
    }),
  };
  const service = new AuthService(users as never, config as never);
  return { service, users, config };
}

describe('AuthService', () => {
  it('register создаёт пользователя и возвращает токены + user DTO', async () => {
    const { service, users } = buildService({ user: null });

    const result = await service.register({
      email: 'new@b.c',
      password: 'secret',
      name: 'New',
    });

    expect(users.create).toHaveBeenCalled();
    expect(users.save).toHaveBeenCalled();
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(result.user).toMatchObject({
      id: 'u1',
      email: 'new@b.c',
      name: 'New',
      baseCurrency: 'RUB',
    });
    expect(result.user.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('register с существующим email → 409', async () => {
    const { service } = buildService();
    await expect(
      service.register({
        email: 'a@b.c',
        password: 'secret',
        name: 'Test',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('login с верным паролем возвращает токены', async () => {
    const { service } = buildService();
    const result = await service.login({ email: 'a@b.c', password: 'secret' });
    expect(result.accessToken).toBeTruthy();
    expect(result.user.email).toBe('a@b.c');
  });

  it('login с неверным паролем → 401', async () => {
    const { service } = buildService();
    await expect(
      service.login({ email: 'a@b.c', password: 'wrong' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('login неизвестного пользователя → 401', async () => {
    const { service } = buildService({ user: null });
    await expect(
      service.login({ email: 'x@y.z', password: 'secret' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refresh с валидным токеном выдаёт новую пару', async () => {
    const { service } = buildService();
    const refreshToken = jwt.sign(
      { sub: 'u1', email: 'a@b.c' },
      'refresh-secret',
      { expiresIn: '1h' },
    );

    const result = await service.refresh(refreshToken);
    expect(result.accessToken).toBeTruthy();
    expect(result.user.id).toBe('u1');
  });

  it('refresh с невалидным токеном → 401', async () => {
    const { service } = buildService();
    await expect(service.refresh('bad-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refresh, если пользователь удалён → 401', async () => {
    const { service, users } = buildService();
    users.findOne.mockResolvedValueOnce(null);
    const refreshToken = jwt.sign(
      { sub: 'gone', email: 'a@b.c' },
      'refresh-secret',
      { expiresIn: '1h' },
    );

    await expect(service.refresh(refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
