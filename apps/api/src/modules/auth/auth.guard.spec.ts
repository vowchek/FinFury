import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import * as jwt from 'jsonwebtoken';
import { JwtAuthGuard } from './auth.guard';

function buildGuard() {
  const config = {
    get: vi.fn(() => 'access-secret'),
  };
  const guard = new JwtAuthGuard(config as never);
  return guard;
}

function context(authorization?: string) {
  const req: { headers: { authorization?: string }; user?: { id: string; email: string } } = {
    headers: { authorization },
  };
  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
    __req: req,
  };
}

describe('JwtAuthGuard', () => {
  it('без Bearer → 401', () => {
    const guard = buildGuard();
    expect(() => guard.canActivate(context() as never)).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(context('Token abc') as never)).toThrow(
      UnauthorizedException,
    );
  });

  it('невалидный JWT → 401', () => {
    const guard = buildGuard();
    expect(() =>
      guard.canActivate(context('Bearer not-a-jwt') as never),
    ).toThrow(UnauthorizedException);
  });

  it('валидный access-токен подставляет req.user', () => {
    const guard = buildGuard();
    const token = jwt.sign({ sub: 'u1', email: 'a@b.c' }, 'access-secret', {
      expiresIn: '15m',
    });
    const ctx = context(`Bearer ${token}`);

    expect(guard.canActivate(ctx as never)).toBe(true);
    expect(ctx.__req.user).toEqual({ id: 'u1', email: 'a@b.c' });
  });
});
