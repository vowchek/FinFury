import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { IncomeEventType } from '@finfury/contracts';
import { MoneyDto } from '../transactions/transactions.dto';

/**
 * Создание income event (ADR-006).
 * `netAmount` не принимается — вычисляется на бэке: net = gross − taxWithheld.
 */
export class CreateIncomeEventDto {
  @IsString()
  accountId: string;

  @IsString()
  assetId: string;

  @IsEnum(IncomeEventType)
  type: IncomeEventType;

  @IsOptional()
  @IsDateString()
  announcementDate?: string;

  @IsOptional()
  @IsDateString()
  exDate?: string;

  @IsOptional()
  @IsDateString()
  recordDate?: string;

  @IsDateString()
  paymentDate: string;

  @IsObject()
  @ValidateNested()
  @Type(() => MoneyDto)
  grossAmount: MoneyDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => MoneyDto)
  taxWithheld?: MoneyDto;

  @IsBoolean()
  reinvested: boolean;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => MoneyDto)
  reinvestPrice?: MoneyDto;

  @IsOptional()
  @IsString()
  transactionId?: string;

  /**
   * Уже распределённый доход: событие без зачисления в кэш (нет income-транзакции).
   * Для снапшота / исторической атрибуции в PnL.
   */
  @IsOptional()
  @IsBoolean()
  distributed?: boolean;
}

/** Фильтры списка и статистики доходов. */
export class ListIncomeQueryDto {
  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsString()
  assetId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}