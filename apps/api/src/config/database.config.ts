import { TypeOrmModuleOptions } from '@nestjs/typeorm';

/**
 * Конфигурация подключения к PostgreSQL (ADR-002).
 * URL берётся из env: DATABASE_URL.
 */
export function databaseConfig(): TypeOrmModuleOptions {
  return {
    type: 'postgres',
    url: process.env.DATABASE_URL,
    autoLoadEntities: true,
    synchronize: process.env.NODE_ENV !== 'production',
    // В production — миграции, не synchronize
  };
}