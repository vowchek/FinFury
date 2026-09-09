import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ImportSourceType, Money, TransactionDto, TransactionType } from '@finfury/contracts';
import { Repository } from 'typeorm';
import {
  convertMoney,
  precisionForAccountType,
  precisionForAssetType,
} from '../../common/fx-convert';
import { PriceService } from '../../prices/price.service';
import { Account } from '../accounts/account.entity';
import { Asset } from '../assets/asset.entity';
import { LotsService } from '../lots/lots.service';
import { PositionsService } from '../positions/positions.service';
import { Transaction } from './transaction.entity';
import {
  CreateOpeningDto,
  CreateTransactionDto,
  MoneyDto,
  UpdateTransactionDto,
} from './transactions.dto';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactions: Repository<Transaction>,
    @InjectRepository(Account)
    private readonly accounts: Repository<Account>,
    @InjectRepository(Asset)
    private readonly assets: Repository<Asset>,
    private readonly positions: PositionsService,
    private readonly lots: LotsService,
    private readonly prices: PriceService,
  ) {}

  private async findAccount(userId: string, accountId: string): Promise<Account> {
    const account = await this.accounts.findOne({ where: { id: accountId, userId } });
    if (!account) throw new NotFoundException('Счёт не найден');
    return account;
  }

  /**
   * Приводит Money к валюте счёта (ADR-009).
   * Цена в валюте котировки (USD для иностранной акции) → mid-rate в account.currency.
   */
  private async toAccountMoney(
    money: MoneyDto | undefined,
    account: Account,
    assetType?: string,
  ): Promise<Money | undefined> {
    if (money === undefined) return undefined;
    const toCcy = account.currency.toUpperCase();
    const fromCcy = money.currency.toUpperCase();
    const toPrec = precisionForAccountType(account.type);
    if (fromCcy === toCcy) {
      return { amount: money.amount, currency: toCcy };
    }
    const fromPrec = precisionForAssetType(assetType);
    try {
      const fx = await this.prices.getFxRate(fromCcy, toCcy);
      return {
        amount: convertMoney(money.amount, fromPrec, toPrec, fx.rate),
        currency: toCcy,
      };
    } catch {
      throw new BadRequestException(
        `Не удалось перевести ${fromCcy} → ${toCcy} (нет FX-курса). Введите сумму в ${toCcy} или повторите позже.`,
      );
    }
  }

  async create(
    userId: string,
    accountId: string,
    dto: CreateTransactionDto,
  ): Promise<TransactionDto> {
    const account = await this.findAccount(userId, accountId);
    if (dto.type === TransactionType.SELL && dto.assetId) {
      await this.assertSellAllowed(accountId, dto.assetId, dto.quantity ?? 0);
    }

    let assetType: string | undefined;
    if (dto.assetId) {
      const asset = await this.assets.findOne({ where: { id: dto.assetId } });
      if (!asset) throw new NotFoundException(`Актив не найден: ${dto.assetId}`);
      assetType = asset.type;
    }

    const price = await this.toAccountMoney(dto.price, account, assetType);
    const amount = await this.toAccountMoney(dto.amount, account, assetType);
    const fee = await this.toAccountMoney(dto.fee, account, assetType);
    const tax = await this.toAccountMoney(dto.tax, account, assetType);

    const tx = this.transactions.create({
      accountId,
      assetId: dto.assetId ?? null,
      type: dto.type,
      date: dto.date,
      quantity: dto.quantity === undefined ? null : String(dto.quantity),
      opening: dto.type === TransactionType.OPENING,
      source: dto.source ?? ImportSourceType.MANUAL,
      sourceId: dto.sourceId ?? null,
      note: dto.note ?? null,
    });
    this.applyMoney(tx, 'price', price);
    this.applyMoney(tx, 'amount', amount);
    this.applyMoney(tx, 'fee', fee);
    this.applyMoney(tx, 'tax', tax);
    await this.transactions.save(tx);
    await this.recalc(accountId, account.currency);
    return this.toDto(tx);
  }

  /**
   * Snapshot-ввод (режим A): конвертирует список текущих позиций в
   * `opening`-транзакции на дату начала ведения и пересчитывает позиции.
   * Цена может быть в валюте актива — переводится в валюту счёта через FX.
   */
  async createOpening(
    userId: string,
    accountId: string,
    dto: CreateOpeningDto,
  ): Promise<TransactionDto[]> {
    const account = await this.findAccount(userId, accountId);

    const existing = await this.transactions.count({ where: { accountId } });
    if (existing > 0) {
      throw new ConflictException('У счёта уже есть транзакции — snapshot-ввод запрещён');
    }

    const rows: Transaction[] = [];
    for (const item of dto.items) {
      if (item.quantity <= 0) {
        throw new BadRequestException(`Количество должно быть больше 0 (актив ${item.assetId})`);
      }
      const asset = await this.assets.findOne({ where: { id: item.assetId } });
      if (!asset) throw new NotFoundException(`Актив не найден: ${item.assetId}`);

      const avgPrice = await this.toAccountMoney(item.avgPrice, account, asset.type);
      if (!avgPrice) {
        throw new BadRequestException(`Некорректная цена для актива ${item.assetId}`);
      }
      const amount = Math.round(item.quantity * avgPrice.amount);
      const tx = this.transactions.create({
        accountId,
        assetId: asset.id,
        type: TransactionType.OPENING,
        date: dto.date,
        quantity: String(item.quantity),
        opening: true,
        source: ImportSourceType.MANUAL,
        sourceId: null,
        note: null,
      });
      this.applyMoney(tx, 'price', avgPrice);
      this.applyMoney(tx, 'amount', { amount, currency: avgPrice.currency });
      rows.push(tx);
    }

    await this.transactions.save(rows);
    await this.recalc(accountId, account.currency);
    return rows.map((r) => this.toDto(r));
  }

  async list(userId: string, accountId: string): Promise<TransactionDto[]> {
    await this.findAccount(userId, accountId);
    const rows = await this.transactions.find({
      where: { accountId },
      order: { date: 'ASC', createdAt: 'ASC' },
    });
    return rows.map((r) => this.toDto(r));
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateTransactionDto,
  ): Promise<TransactionDto> {
    const tx = await this.findOwned(userId, id);
    const account = await this.accounts.findOne({ where: { id: tx.accountId } });
    if (!account) throw new NotFoundException('Счёт не найден');

    const newType = dto.type ?? tx.type;
    const newAssetId = dto.assetId !== undefined ? dto.assetId : tx.assetId;
    const newQuantity = dto.quantity !== undefined ? dto.quantity : Number(tx.quantity ?? 0);
    if (newType === TransactionType.SELL && newAssetId) {
      await this.assertSellAllowed(tx.accountId, newAssetId, newQuantity, tx.id);
    }
    if (dto.assetId !== undefined) tx.assetId = dto.assetId ?? null;
    if (dto.type !== undefined) tx.type = dto.type;
    if (dto.date !== undefined) tx.date = dto.date;
    if (dto.quantity !== undefined) tx.quantity = String(dto.quantity);
    if (dto.note !== undefined) tx.note = dto.note ?? null;

    let assetType: string | undefined;
    if (newAssetId) {
      const asset = await this.assets.findOne({ where: { id: newAssetId } });
      assetType = asset?.type;
    }
    this.applyMoney(tx, 'price', await this.toAccountMoney(dto.price, account, assetType));
    this.applyMoney(tx, 'amount', await this.toAccountMoney(dto.amount, account, assetType));
    this.applyMoney(tx, 'fee', await this.toAccountMoney(dto.fee, account, assetType));
    this.applyMoney(tx, 'tax', await this.toAccountMoney(dto.tax, account, assetType));

    await this.transactions.save(tx);
    await this.recalc(tx.accountId, account.currency);
    return this.toDto(tx);
  }

  async remove(userId: string, id: string): Promise<void> {
    const tx = await this.findOwned(userId, id);
    const account = await this.accounts.findOne({ where: { id: tx.accountId } });
    await this.transactions.remove(tx);
    if (account) await this.recalc(tx.accountId, account.currency);
  }

  private async findOwned(userId: string, id: string): Promise<Transaction> {
    const tx = await this.transactions.findOne({ where: { id } });
    if (!tx) throw new NotFoundException('Транзакция не найдена');
    await this.findAccount(userId, tx.accountId);
    return tx;
  }

  private async assertSellAllowed(
    accountId: string,
    assetId: string,
    quantity: number,
    excludeTxId?: string,
  ): Promise<void> {
    let available = await this.lots.availableQuantity(accountId, assetId);
    if (excludeTxId) {
      const tx = await this.transactions.findOne({ where: { id: excludeTxId } });
      if (tx && tx.type === TransactionType.SELL && tx.assetId === assetId) {
        available += Number(tx.quantity ?? 0);
      }
    }
    if (quantity > available) {
      throw new BadRequestException('Недостаточно партий для продажи');
    }
  }

  private async recalc(accountId: string, currency: string): Promise<void> {
    await this.positions.recalcForAccount(accountId, currency);
    await this.lots.recalcForAccount(accountId, currency);
  }

  private applyMoney(
    tx: Transaction,
    field: 'price' | 'amount' | 'fee' | 'tax',
    money: MoneyDto | Money | undefined,
  ): void {
    if (money === undefined) return;
    (tx as unknown as Record<string, unknown>)[`${field}Amount`] = money.amount;
    (tx as unknown as Record<string, unknown>)[`${field}Currency`] = money.currency;
  }

  private toDto(tx: Transaction): TransactionDto {
    const money = (field: 'price' | 'amount' | 'fee' | 'tax') => {
      const amount = (tx as unknown as Record<string, unknown>)[`${field}Amount`];
      const currency = (tx as unknown as Record<string, unknown>)[`${field}Currency`];
      if (amount == null || currency == null) return undefined as never;
      return { amount: amount as number, currency: currency as string };
    };
    return {
      id: tx.id,
      accountId: tx.accountId,
      assetId: tx.assetId ?? undefined,
      type: tx.type,
      date: tx.date,
      quantity: tx.quantity === null ? undefined : Number(tx.quantity),
      price: money('price'),
      amount: money('amount'),
      fee: money('fee'),
      tax: money('tax'),
      realizedPnl:
        tx.realizedPnlAmount !== null && tx.realizedPnlCurrency
          ? { amount: tx.realizedPnlAmount, currency: tx.realizedPnlCurrency }
          : undefined,
      source: tx.source,
      sourceId: tx.sourceId ?? undefined,
      note: tx.note ?? undefined,
    };
  }
}
