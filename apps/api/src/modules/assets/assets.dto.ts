import {
  IsEnum,
  IsISO4217CurrencyCode,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { AssetType } from '@finfury/contracts';

export class CreateAssetDto {
  @IsString()
  @MaxLength(20)
  symbol: string;

  @IsString()
  @MaxLength(200)
  name: string;

  @IsEnum(AssetType)
  type: AssetType;

  @IsISO4217CurrencyCode()
  currency: string;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  isin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  figi?: string;
}