import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { TransactionDto } from '@finfury/contracts';
import { AuthUser, JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { TransactionsService } from './transactions.service';
import {
  CreateOpeningDto,
  CreateTransactionDto,
  UpdateTransactionDto,
} from './transactions.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Post('accounts/:accountId/transactions')
  create(
    @CurrentUser() user: AuthUser,
    @Param('accountId') accountId: string,
    @Body() dto: CreateTransactionDto,
  ): Promise<TransactionDto> {
    return this.transactions.create(user.id, accountId, dto);
  }

  @Post('accounts/:accountId/opening')
  createOpening(
    @CurrentUser() user: AuthUser,
    @Param('accountId') accountId: string,
    @Body() dto: CreateOpeningDto,
  ): Promise<TransactionDto[]> {
    return this.transactions.createOpening(user.id, accountId, dto);
  }

  @Get('accounts/:accountId/transactions')
  list(
    @CurrentUser() user: AuthUser,
    @Param('accountId') accountId: string,
  ): Promise<TransactionDto[]> {
    return this.transactions.list(user.id, accountId);
  }

  @Patch('transactions/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTransactionDto,
  ): Promise<TransactionDto> {
    return this.transactions.update(user.id, id, dto);
  }

  @Delete('transactions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    return this.transactions.remove(user.id, id);
  }
}