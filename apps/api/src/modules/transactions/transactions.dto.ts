import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsISO4217CurrencyCode,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { ImportSourceType, TransactionType } from '@finfury/contracts';

export class MoneyDto {
  @IsInt()
  @Min(0)
  amount: number;

  @IsISO4217CurrencyCode()
  currency: string;
}

export class CreateTransactionDto {
  @IsOptional()
  @IsString()
  assetId?: string;

  @IsEnum(TransactionType)
  type: TransactionType;

  @IsDateString()
  date: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => MoneyDto)
  price?: MoneyDto;

  @IsObject()
  @ValidateNested()
  @Type(() => MoneyDto)
  amount: MoneyDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => MoneyDto)
  fee?: MoneyDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => MoneyDto)
  tax?: MoneyDto;

  @IsOptional()
  @IsEnum(ImportSourceType)
  source?: ImportSourceType;

  @IsOptional()
  @IsString()
  sourceId?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class OpeningItemDto {
  @IsString()
  assetId: string;

  @IsNumber()
  @Min(0)
  quantity: number;

  @IsObject()
  @ValidateNested()
  @Type(() => MoneyDto)
  avgPrice: MoneyDto;
}

export class CreateOpeningDto {
  @IsDateString()
  date: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OpeningItemDto)
  items: OpeningItemDto[];
}

export class UpdateTransactionDto {
  @IsOptional()
  @IsString()
  assetId?: string;

  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => MoneyDto)
  price?: MoneyDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => MoneyDto)
  amount?: MoneyDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => MoneyDto)
  fee?: MoneyDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => MoneyDto)
  tax?: MoneyDto;

  @IsOptional()
  @IsString()
  note?: string;
}