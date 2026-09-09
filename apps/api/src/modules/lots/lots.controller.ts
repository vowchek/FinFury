import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { LotDto } from '@finfury/contracts';
import { AuthUser, JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { LotsService } from './lots.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class LotsController {
  constructor(private readonly lots: LotsService) {}

  @Get('accounts/:accountId/lots')
  list(
    @CurrentUser() user: AuthUser,
    @Param('accountId') accountId: string,
    @Query('assetId') assetId?: string,
  ): Promise<LotDto[]> {
    return this.lots.list(user.id, accountId, assetId);
  }
}