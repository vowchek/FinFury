import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AssetDto, AssetPriceDto } from '@finfury/contracts';
import { ExternalAssetResult } from '../../prices/price-provider.interface';
import { AccountsService } from '../accounts/accounts.service';
import { AuthUser, JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AssetsService } from './assets.service';
import { CreateAssetDto } from './assets.dto';

@Controller('assets')
@UseGuards(JwtAuthGuard)
export class AssetsController {
  constructor(
    private readonly assets: AssetsService,
    private readonly accounts: AccountsService,
  ) {}

  @Get()
  search(@Query('q') q?: string): Promise<AssetDto[]> {
    return this.assets.search(q);
  }

  /** Поиск активов во внешних источниках по типу счёта (до :id, чтобы не перехватывалось). */
  @Get('external')
  async searchExternal(
    @CurrentUser() user: AuthUser,
    @Query('q') q: string,
    @Query('accountId') accountId: string,
  ): Promise<ExternalAssetResult[]> {
    if (!q) return [];
    const account = await this.accounts.get(user.id, accountId);
    return this.assets.searchExternal(q, account.type);
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<AssetPriceDto> {
    return this.assets.getWithPrice(id);
  }

  /**
   * Авто-создание актива при выборе из внешних результатов.
   * Не предназначен для ручного создания пользователем.
   */
  @Post()
  ensure(@Body() dto: CreateAssetDto): Promise<AssetDto> {
    return this.assets.ensureAsset(dto);
  }
}