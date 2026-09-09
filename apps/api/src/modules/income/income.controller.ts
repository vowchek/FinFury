import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IncomeEventDto, IncomeStatsDto } from '@finfury/contracts';
import { AuthUser, JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateIncomeEventDto, ListIncomeQueryDto } from './income.dto';
import { IncomeService } from './income.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class IncomeController {
  constructor(private readonly income: IncomeService) {}

  @Post('income')
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateIncomeEventDto,
  ): Promise<IncomeEventDto> {
    return this.income.create(user.id, dto);
  }

  @Get('income')
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListIncomeQueryDto,
  ): Promise<IncomeEventDto[]> {
    return this.income.list(user.id, query);
  }

  @Get('income/stats')
  stats(
    @CurrentUser() user: AuthUser,
    @Query() query: ListIncomeQueryDto,
  ): Promise<IncomeStatsDto> {
    return this.income.stats(user.id, query);
  }
}