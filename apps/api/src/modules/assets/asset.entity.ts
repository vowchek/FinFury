import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AssetType } from '@finfury/contracts';

/**
 * Актив/инструмент — глобальный справочник (не per-user), чтобы цены
 * и income events были общими (ADR-005, domain-model).
 */
@Entity('assets')
export class Asset {
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

  @Column({ type: 'varchar', nullable: true })
  figi: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
