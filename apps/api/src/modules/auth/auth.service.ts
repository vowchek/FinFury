import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { AuthResponseDto, UserDto } from '@finfury/contracts';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { Repository } from 'typeorm';
import { LoginDto, RegisterDto } from './auth.dto';
import { User } from './user.entity';

interface JwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly config: ConfigService,
  ) {}

  private toDto(user: User): UserDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      baseCurrency: user.baseCurrency,
      createdAt: user.createdAt.toISOString(),
    };
  }

  private signAccess(user: User): string {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    const options: jwt.SignOptions = {
      expiresIn: (this.config.get<string>('JWT_ACCESS_TTL') ?? '15m') as jwt.SignOptions['expiresIn'],
    };
    return jwt.sign(payload, this.config.get<string>('JWT_ACCESS_SECRET')!, options);
  }

  private signRefresh(user: User): string {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    const options: jwt.SignOptions = {
      expiresIn: (this.config.get<string>('JWT_REFRESH_TTL') ?? '30d') as jwt.SignOptions['expiresIn'],
    };
    return jwt.sign(payload, this.config.get<string>('JWT_REFRESH_SECRET')!, options);
  }

  private buildResponse(user: User): AuthResponseDto {
    return {
      accessToken: this.signAccess(user),
      refreshToken: this.signRefresh(user),
      user: this.toDto(user),
    };
  }

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const existing = await this.users.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Пользователь с таким email уже существует');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.users.save(
      this.users.create({ ...dto, passwordHash }),
    );
    return this.buildResponse(user);
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.users.findOne({ where: { email: dto.email } });
    if (!user) {
      throw new UnauthorizedException('Неверный email или пароль');
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Неверный email или пароль');
    }
    return this.buildResponse(user);
  }

  async refresh(refreshToken: string): Promise<AuthResponseDto> {
    try {
      const payload = jwt.verify(
        refreshToken,
        this.config.get<string>('JWT_REFRESH_SECRET')!,
      ) as JwtPayload;
      const user = await this.users.findOne({ where: { id: payload.sub } });
      if (!user) {
        throw new UnauthorizedException('Пользователь не найден');
      }
      return this.buildResponse(user);
    } catch {
      throw new UnauthorizedException('Недействительный refresh-токен');
    }
  }
}