import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { moneyAmountColumn } from '../../common/money-column';

/**
 * Позиция — производный кэш (ADR-003), НЕ источник истины.
 * Пересчитывается из транзакций (см. PositionService, TASK-2).
 * Деньги — целые числа в минимальных единицах + currency (ADR-002), bigint.
 */
@Entity('positions')
@Unique(['accountId', 'assetId'])
export class Position {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'account_id' })
  accountId: string;

  @Column({ type: 'uuid', name: 'asset_id' })
  assetId: string;

  @Column({ type: 'numeric', precision: 28, scale: 8 })
  quantity: string;

  @Column(moneyAmountColumn({ name: 'avg_cost_basis_amount' }))
  avgCostBasisAmount: number;

  @Column({ type: 'varchar', name: 'avg_cost_basis_currency', length: 3 })
  avgCostBasisCurrency: string;

  @Column({ type: 'varchar', length: 3 })
  currency: string;
}
