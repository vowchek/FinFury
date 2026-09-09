import { ColumnOptions, ValueTransformer } from 'typeorm';

/**
 * pg отдаёт bigint как string; в JS для сумм в минимальных единицах
 * хватает number (до Number.MAX_SAFE_INTEGER ≈ 9e15).
 */
const bigintToNumber: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | number | null) => {
    if (value === null || value === undefined) return null;
    return typeof value === 'number' ? value : Number(value);
  },
};

/** Колонка суммы в минимальных единицах: PostgreSQL `bigint` (int4 переполняется при precision 6). */
export function moneyAmountColumn(options: { name: string; nullable?: boolean } = { name: '' }): ColumnOptions {
  const { name, nullable = false } = options;
  return {
    name,
    type: 'bigint',
    nullable,
    transformer: bigintToNumber,
  };
}
