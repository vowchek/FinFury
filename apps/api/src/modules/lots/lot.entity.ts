import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { moneyAmountColumn } from '../../common/money-column';
import { Position } from '../positions/position.entity';

/**
 * Партия (lot) — остаток покупки для cost basis по FIFO (подзадача 2.3).
 * Производный кэш (как `positions`): пересчитывается из транзакций
 * (`LotsService.recalcForAccount`), НЕ источник истины.
 * Деньги — целые числа в минимальных единицах + currency (ADR-002), bigint.
 */
@Entity('lots')
@Index(['positionId'])
export class Lot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'position_id', type: 'uuid' })
  positionId: string;

  @ManyToOne(() => Position, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'position_id' })
  position: Position;

  /** Остаток партии (дробное количество). */
  @Column({ type: 'numeric', precision: 28, scale: 8 })
  quantity: string;

  /** Cost basis за штуку в минимальных единицах (цена buy/opening-транзакции). */
  @Column(moneyAmountColumn({ name: 'cost_basis_amount' }))
  costBasisAmount: number;

  @Column({ type: 'varchar', name: 'cost_basis_currency', length: 3 })
  costBasisCurrency: string;

  /** Дата приобретения (дата buy/opening-транзакции). */
  @Column({ name: 'acquired_at', type: 'date' })
  acquiredAt: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
