import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AccountDto, AccountType } from '@finfury/contracts';
import { Repository } from 'typeorm';
import { Account } from './account.entity';
import { CreateAccountDto, UpdateAccountDto } from './accounts.dto';

/** Крипто-кошелёк котируется и хранится только в USD (ADR-009). */
function assertWalletUsd(type: AccountType | string, currency: string): void {
  if (type === AccountType.WALLET || type === 'wallet') {
    if (currency.toUpperCase() !== 'USD') {
      throw new BadRequestException('Крипто-кошелёк (WALLET) может быть только в USD');
    }
  }
}

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(Account) private readonly accounts: Repository<Account>,
  ) {}

  private toDto(account: Account): AccountDto {
    return {
      id: account.id,
      name: account.name,
      type: account.type,
      currency: account.currency,
      institution: account.institution ?? undefined,
      externalRef: account.externalRef ?? undefined,
    };
  }

  async list(userId: string): Promise<AccountDto[]> {
    const rows = await this.accounts.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });
    return rows.map((r) => this.toDto(r));
  }

  async get(userId: string, id: string): Promise<AccountDto> {
    const account = await this.accounts.findOne({ where: { id, userId } });
    if (!account) throw new NotFoundException('Счёт не найден');
    return this.toDto(account);
  }

  async create(userId: string, dto: CreateAccountDto): Promise<AccountDto> {
    assertWalletUsd(dto.type, dto.currency);
    const account = await this.accounts.save(
      this.accounts.create({ ...dto, userId }),
    );
    return this.toDto(account);
  }

  async update(userId: string, id: string, dto: UpdateAccountDto): Promise<AccountDto> {
    const account = await this.accounts.findOne({ where: { id, userId } });
    if (!account) throw new NotFoundException('Счёт не найден');
    const nextType = dto.type ?? account.type;
    const nextCurrency = dto.currency ?? account.currency;
    assertWalletUsd(nextType, nextCurrency);
    Object.assign(account, dto);
    const saved = await this.accounts.save(account);
    return this.toDto(saved);
  }

  async remove(userId: string, id: string): Promise<void> {
    const account = await this.accounts.findOne({ where: { id, userId } });
    if (!account) throw new NotFoundException('Счёт не найден');
    await this.accounts.remove(account);
  }
}