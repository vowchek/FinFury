import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PricesModule } from '../../prices/prices.module';
import { Account } from '../accounts/account.entity';
import { Asset } from '../assets/asset.entity';
import { Transaction } from '../transactions/transaction.entity';
import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';
import { Position } from './position.entity';
import { PositionsService } from './positions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Position, Transaction, Asset, Account]),
    PricesModule,
  ],
  controllers: [PortfolioController],
  providers: [PositionsService, PortfolioService],
  exports: [PositionsService],
})
export class PositionsModule {}