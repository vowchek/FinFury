import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { IncomeEventType } from '@finfury/contracts';
import { moneyAmountColumn } from '../../common/money-column';

/**
 * Доходное событие (ADR-006): дивиденд/купон/процент/распределение.
 * Деньги — целые числа в минимальных единицах + currency (ADR-002), bigint,
 * парами столбцов `<field>_amount`/`<field>_currency`.
 *
 * Учёт по payment-date (cash basis); announcement/ex/record-date — для справки.
 * `transactionId` — обычный столбец без FK-ограничения: при удалении связанной
 * транзакции книги связь разрывается (поле становится null), событие сохраняется
 * (событие — первичное представление дохода, ADR-006).
 */
@Entity('income_events')
@Index(['accountId', 'paymentDate'])
@Index(['accountId', 'assetId'])
export class IncomeEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'account_id' })
  accountId: string;

  @Column({ name: 'asset_id', type: 'uuid' })
  assetId: string;

  @Column({ type: 'enum', enum: IncomeEventType })
  type: IncomeEventType;

  @Column({ name: 'announcement_date', type: 'date', nullable: true })
  announcementDate: string | null;

  @Column({ name: 'ex_date', type: 'date', nullable: true })
  exDate: string | null;

  @Column({ name: 'record_date', type: 'date', nullable: true })
  recordDate: string | null;

  @Column({ name: 'payment_date', type: 'date' })
  paymentDate: string;

  @Column(moneyAmountColumn({ name: 'gross_amount' }))
  grossAmount: number;

  @Column({ name: 'gross_currency', type: 'varchar', length: 3 })
  grossCurrency: string;

  @Column(moneyAmountColumn({ name: 'tax_withheld_amount', nullable: true }))
  taxWithheldAmount: number | null;

  @Column({ name: 'tax_withheld_currency', type: 'varchar', length: 3, nullable: true })
  taxWithheldCurrency: string | null;

  @Column(moneyAmountColumn({ name: 'net_amount' }))
  netAmount: number;

  @Column({ name: 'net_currency', type: 'varchar', length: 3 })
  netCurrency: string;

  @Column({ type: 'boolean', default: false })
  reinvested: boolean;

  @Column({ name: 'transaction_id', type: 'uuid', nullable: true })
  transactionId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
