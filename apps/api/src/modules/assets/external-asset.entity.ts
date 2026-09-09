import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { AssetType } from '@finfury/contracts';

/**
 * Кэш результатов поиска активов во внешних источниках (MOEX, Yahoo, CoinGecko).
 * Хранит найденные активы, чтобы не ходить во внешний API повторно.
 * Не является справочником — только кэш поиска.
 */
@Entity('external_assets')
@Index(['symbol', 'source'], { unique: true })
export class ExternalAsset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar' })
  symbol: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'enum', enum: AssetType })
  type: AssetType;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column({ type: 'varchar', nullable: true })
  isin: string | null;

  /** Источник: moex / yahoo / coingecko */
  @Column({ type: 'varchar' })
  source: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}