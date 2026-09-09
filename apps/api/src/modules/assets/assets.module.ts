import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PricesModule } from '../../prices/prices.module';
import { AccountsModule } from '../accounts/accounts.module';
import { Asset } from './asset.entity';
import { ExternalAsset } from './external-asset.entity';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';

@Module({
  imports: [TypeOrmModule.forFeature([Asset, ExternalAsset]), PricesModule, AccountsModule],
  controllers: [AssetsController],
  providers: [AssetsService],
  exports: [AssetsService, TypeOrmModule],
})
export class AssetsModule {}