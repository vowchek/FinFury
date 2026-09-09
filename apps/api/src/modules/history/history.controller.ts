import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { PortfolioHistoryDto } from '@finfury/contracts';
import { AuthUser, JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { HistoryService } from './history.service';
import { HistoryQueryDto } from './history.dto';

/** GET /history — история стоимости портфеля и счетов (фаза 2; ADR-008). */
@Controller('history')
@UseGuards(JwtAuthGuard)
export class HistoryController {
  constructor(private readonly history: HistoryService) {}

  /** История всего портфеля: ?from&to&interval. */
  @Get()
  portfolio(
    @CurrentUser() user: AuthUser,
    @Query() query: HistoryQueryDto,
  ): Promise<PortfolioHistoryDto> {
    return this.history.getPortfolioHistory(user.id, query);
  }

  /** История одного счёта: ?from&to&interval. */
  @Get(':accountId')
  account(
    @CurrentUser() user: AuthUser,
    @Param('accountId') accountId: string,
    @Query() query: HistoryQueryDto,
  ): Promise<PortfolioHistoryDto> {
    return this.history.getAccountHistory(user.id, accountId, query);
  }
}
