import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as jwt from 'jsonwebtoken';

export interface AuthUser {
  id: string;
  email: string;
}

/**
 * Проверяет Bearer access-токен и подставляет `req.user` (AuthUser).
 * Используется на защищённых маршрутах (все, кроме /auth/*).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Отсутствует access-токен');
    }
    const token = header.slice('Bearer '.length);
    try {
      const payload = jwt.verify(
        token,
        this.config.get<string>('JWT_ACCESS_SECRET')!,
      ) as { sub: string; email: string };
      req.user = { id: payload.sub, email: payload.email };
      return true;
    } catch {
      throw new UnauthorizedException('Недействительный access-токен');
    }
  }
}
