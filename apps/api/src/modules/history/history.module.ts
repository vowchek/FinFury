import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PricesModule } from '../../prices/prices.module';
import { Account } from '../accounts/account.entity';
import { Asset } from '../assets/asset.entity';
import { Transaction } from '../transactions/transaction.entity';
import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Account, Asset, Transaction]),
    PricesModule,
  ],
  controllers: [HistoryController],
  providers: [HistoryService],
  exports: [HistoryService],
})
export class HistoryModule {}
