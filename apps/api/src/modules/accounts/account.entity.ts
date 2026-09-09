import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AccountType } from '@finfury/contracts';
import { User } from '../auth/user.entity';

/**
 * Счёт/кошелёк пользователя (ADR-003: единая книга).
 * Деньги — целые числа в минимальных единицах + currency (ADR-002).
 */
@Entity('accounts')
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'enum', enum: AccountType })
  type: AccountType;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column({ type: 'varchar', nullable: true })
  institution: string | null;

  @Column({ name: 'external_ref', type: 'varchar', nullable: true })
  externalRef: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
