import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PricesModule } from '../../prices/prices.module';
import { Account } from '../accounts/account.entity';
import { Asset } from '../assets/asset.entity';
import { LotsModule } from '../lots/lots.module';
import { PositionsModule } from '../positions/positions.module';
import { TransactionsController } from './transactions.controller';
import { Transaction } from './transaction.entity';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, Account, Asset]),
    PositionsModule,
    LotsModule,
    PricesModule,
  ],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService, TypeOrmModule],
})
export class TransactionsModule {}
