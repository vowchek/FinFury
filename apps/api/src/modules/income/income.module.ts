import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from '../accounts/account.entity';
import { Asset } from '../assets/asset.entity';
import { LotsModule } from '../lots/lots.module';
import { Position } from '../positions/position.entity';
import { PositionsModule } from '../positions/positions.module';
import { Transaction } from '../transactions/transaction.entity';
import { IncomeController } from './income.controller';
import { IncomeEvent } from './income.entity';
import { IncomeService } from './income.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([IncomeEvent, Account, Asset, Transaction, Position]),
    PositionsModule,
    LotsModule,
  ],
  controllers: [IncomeController],
  providers: [IncomeService],
  exports: [IncomeService, TypeOrmModule],
})
export class IncomeModule {}