import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { resolve } from 'path';
import { databaseConfig } from './config/database.config';
import { AccountsModule } from './modules/accounts/accounts.module';
import { AssetsModule } from './modules/assets/assets.module';
import { AuthModule } from './modules/auth/auth.module';
import { HistoryModule } from './modules/history/history.module';
import { HealthModule } from './modules/health/health.module';
import { IncomeModule } from './modules/income/income.module';
import { LotsModule } from './modules/lots/lots.module';
import { PositionsModule } from './modules/positions/positions.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
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
    HistoryModule,
    HealthModule,
    AccountsModule,
    AssetsModule,
    TransactionsModule,
    IncomeModule,
    PositionsModule,
    LotsModule,
    PricesModule,
  ],
})
export class AppModule {}