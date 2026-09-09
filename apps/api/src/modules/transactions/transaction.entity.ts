import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ImportSourceType, TransactionType } from '@finfury/contracts';
import { moneyAmountColumn } from '../../common/money-column';

/**
 * Транзакция — ядро единой книги (ADR-003).
 * Деньги — целые числа в минимальных единицах + currency (ADR-002), bigint.
 * `opening`-транзакции помечаются флагом и не участвуют в расчёте
 * реализованной прибыли как обычные сделки (ADR-003).
 */
@Entity('transactions')
@Index(['accountId', 'date'])
@Index(['source', 'sourceId'], { unique: true })
@Index(['accountId', 'assetId'])
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'account_id' })
  accountId: string;

  @Column({ name: 'asset_id', type: 'uuid', nullable: true })
  assetId: string | null;

  @Column({ type: 'enum', enum: TransactionType })
  type: TransactionType;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'numeric', precision: 28, scale: 8, nullable: true })
  quantity: string | null;

  @Column(moneyAmountColumn({ name: 'price_amount', nullable: true }))
  priceAmount: number | null;

  @Column({ name: 'price_currency', type: 'varchar', length: 3, nullable: true })
  priceCurrency: string | null;

  @Column(moneyAmountColumn({ name: 'amount_amount' }))
  amountAmount: number;

  @Column({ type: 'varchar', name: 'amount_currency', length: 3 })
  amountCurrency: string;

  @Column(moneyAmountColumn({ name: 'fee_amount', nullable: true }))
  feeAmount: number | null;

  @Column({ name: 'fee_currency', type: 'varchar', length: 3, nullable: true })
  feeCurrency: string | null;

  @Column(moneyAmountColumn({ name: 'tax_amount', nullable: true }))
  taxAmount: number | null;

  @Column({ name: 'tax_currency', type: 'varchar', length: 3, nullable: true })
  taxCurrency: string | null;

  /** Реализованная прибыль продажи (FIFO, подзадача 2.3). Только для sell. */
  @Column(moneyAmountColumn({ name: 'realized_pnl_amount', nullable: true }))
  realizedPnlAmount: number | null;

  @Column({ name: 'realized_pnl_currency', type: 'varchar', length: 3, nullable: true })
  realizedPnlCurrency: string | null;

  @Column({ type: 'enum', enum: ImportSourceType })
  source: ImportSourceType;

  @Column({ name: 'source_id', type: 'varchar', nullable: true })
  sourceId: string | null;

  @Column({ type: 'boolean', default: false })
  opening: boolean;

  @Column({ type: 'varchar', nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
