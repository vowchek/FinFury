import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Column()
  name: string;

  @Column({ name: 'base_currency', default: 'RUB' })
  baseCurrency: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}