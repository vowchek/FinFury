import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { PortfolioDto, PositionDto } from '@finfury/contracts';
import { AuthUser, JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PortfolioService } from './portfolio.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class PortfolioController {
  constructor(private readonly portfolio: PortfolioService) {}

  @Get('accounts/:accountId/positions')
  accountPositions(
    @CurrentUser() user: AuthUser,
    @Param('accountId') accountId: string,
  ): Promise<PositionDto[]> {
    return this.portfolio.getAccountPositions(user.id, accountId);
  }

  @Get('portfolio')
  summary(
    @CurrentUser() user: AuthUser,
    @Query('displayCurrency') displayCurrency?: string,
  ): Promise<PortfolioDto> {
    return this.portfolio.getPortfolio(user.id, displayCurrency);
  }
}
