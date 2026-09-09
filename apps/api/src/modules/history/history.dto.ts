import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { HistoryInterval } from '@finfury/contracts';

/** Параметры запроса истории стоимости. */
export class HistoryQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsEnum(HistoryInterval)
  interval?: HistoryInterval;
}
