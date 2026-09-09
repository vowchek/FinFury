import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { resolve } from 'path';
import { databaseConfig } from './config/database.config';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { PricesModule } from './prices/prices.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')],
    }),
    TypeOrmModule.forRootAsync({
      useFactory: databaseConfig,
    }),
    AuthModule,
    HealthModule,
    PricesModule,
  ],
})
export class AppModule {}