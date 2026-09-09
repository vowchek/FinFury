import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ImportSourceType,
  IncomeEventDto,
  IncomeStatsDto,
  IncomeStatsItemDto,
  TransactionType,
} from '@finfury/contracts';
import { Between, FindOptionsWhere, In, Repository } from 'typeorm';
import { Account } from '../accounts/account.entity';
import { Asset } from '../assets/asset.entity';
import { LotsService } from '../lots/lots.service';
import { Position } from '../positions/position.entity';
import { PositionsService } from '../positions/positions.service';
import { Transaction } from '../transactions/transaction.entity';
import { CreateIncomeEventDto, ListIncomeQueryDto } from './income.dto';
import { IncomeEvent } from './income.entity';

/**
 * Доходы как income events (ADR-006).
 * Денежное зачисление — связанная транзакция типа `income` в единой книге (ADR-003),
 * но не единственное представление: событие хранит полную семантику (даты, налоги, DRIP).
 *
 * Политика связи `transactionId`: обычный столбец без FK — при удалении транзакции
 * книги связь разрывается, событие сохраняется.
 */
@Injectable()
export class IncomeService {
  constructor(
    @InjectRepository(IncomeEvent)
    private readonly events: Repository<IncomeEvent>,
    @InjectRepository(Account)
    private readonly accounts: Repository<Account>,
    @InjectRepository(Asset)
    private readonly assets: Repository<Asset>,
    @InjectRepository(Transaction)
    private readonly transactions: Repository<Transaction>,
    @InjectRepository(Position)
    private readonly positionsRepo: Repository<Position>,
    private readonly positions: PositionsService,
    private readonly lots: LotsService,
  ) {}

  async create(userId: string, dto: CreateIncomeEventDto): Promise<IncomeEventDto> {
    const account = await this.findAccount(userId, dto.accountId);
    const asset = await this.assets.findOne({ where: { id: dto.assetId } });
    if (!asset) throw new NotFoundException(`Актив не найден: ${dto.assetId}`);

    // Валидация валют: все суммы в валюте счёта (ADR-002).
    this.requireCurrency(dto.grossAmount.currency, account.currency, 'grossAmount');
    if (dto.taxWithheld) {
      this.requireCurrency(dto.taxWithheld.currency, account.currency, 'taxWithheld');
    }
    if (dto.distributed) {
      if (dto.reinvested) {
        throw new BadRequestException('distributed несовместим с reinvested');
      }
      if (dto.transactionId) {
        throw new BadRequestException('distributed несовместим с transactionId');
      }
    }

    if (dto.reinvested) {
      if (!dto.reinvestPrice) {
        throw new BadRequestException('reinvestPrice обязателен при reinvested: true');
      }
      this.requireCurrency(dto.reinvestPrice.currency, account.currency, 'reinvestPrice');
      if (dto.reinvestPrice.amount <= 0) {
        throw new BadRequestException('reinvestPrice.amount должен быть больше 0');
      }
    }

    // net вычисляется на бэке — клиенту не доверяем.
    const gross = dto.grossAmount.amount;
    const tax = dto.taxWithheld?.amount ?? 0;
    if (tax > gross) {
      throw new BadRequestException('taxWithheld не может превышать grossAmount');
    }
    const net = gross - tax;

    const event = this.events.create({
      accountId: dto.accountId,
      assetId: dto.assetId,
      type: dto.type,
      announcementDate: dto.announcementDate ?? null,
      exDate: dto.exDate ?? null,
      recordDate: dto.recordDate ?? null,
      paymentDate: dto.paymentDate,
      grossAmount: gross,
      grossCurrency: account.currency,
      taxWithheldAmount: dto.taxWithheld?.amount ?? null,
      taxWithheldCurrency: dto.taxWithheld?.currency ?? null,
      netAmount: net,
      netCurrency: account.currency,
      reinvested: dto.reinvested,
      transactionId: null,
    });

    if (dto.reinvested) {
      // DRIP: доход зачислен и сразу реинвестирован — income + buy.
      // Реинвестируется фактически полученная сумма (net после налога).
      const price = dto.reinvestPrice!;
      const quantity = Math.round((net / price.amount) * 1e8) / 1e8;
      const incomeTx = this.transactions.create({
        accountId: dto.accountId,
        assetId: dto.assetId,
        type: TransactionType.INCOME,
        date: dto.paymentDate,
        quantity: null,
        source: ImportSourceType.MANUAL,
        sourceId: null,
        note: null,
      });
      this.applyMoney(incomeTx, 'amount', { amount: net, currency: account.currency });
      const buyTx = this.transactions.create({
        accountId: dto.accountId,
        assetId: dto.assetId,
        type: TransactionType.BUY,
        date: dto.paymentDate,
        quantity: String(quantity),
        source: ImportSourceType.MANUAL,
        sourceId: null,
        note: null,
      });
      this.applyMoney(buyTx, 'price', price);
      this.applyMoney(buyTx, 'amount', { amount: net, currency: account.currency });
      await this.transactions.save([incomeTx, buyTx]);
      event.transactionId = incomeTx.id;
    } else if (dto.transactionId) {
      // Связь с уже существующей транзакцией книги (например, введённой вручную).
      const tx = await this.transactions.findOne({ where: { id: dto.transactionId } });
      if (!tx || tx.accountId !== dto.accountId) {
        throw new BadRequestException('transactionId не найден или не относится к счёту');
      }
      event.transactionId = tx.id;
    } else if (!dto.distributed) {
      // Денежное зачисление: создаём income-транзакцию на фактически полученную сумму (net).
      // distributed: true — только событие (PnL), кэш не меняем.
      const incomeTx = this.transactions.create({
        accountId: dto.accountId,
        assetId: dto.assetId,
        type: TransactionType.INCOME,
        date: dto.paymentDate,
        quantity: null,
        source: ImportSourceType.MANUAL,
        sourceId: null,
        note: null,
      });
      this.applyMoney(incomeTx, 'amount', { amount: net, currency: account.currency });
      await this.transactions.save(incomeTx);
      event.transactionId = incomeTx.id;
    }

    await this.events.save(event);
    if (dto.reinvested) {
      // DRIP-покупка меняет позиции и партии — пересчитываем (ADR-003, подзадача 2.3).
      await this.positions.recalcForAccount(dto.accountId, account.currency);
      await this.lots.recalcForAccount(dto.accountId, account.currency);
    }
    return this.toDto(event);
  }

  async list(userId: string, query: ListIncomeQueryDto): Promise<IncomeEventDto[]> {
    const accounts = await this.ownedAccounts(userId, query.accountId);
    if (accounts.length === 0) return [];
    const rows = await this.events.find({
      where: this.buildWhere(accounts, query),
      order: { paymentDate: 'ASC', createdAt: 'ASC' },
    });
    return rows.map((r) => this.toDto(r));
  }

  async stats(userId: string, query: ListIncomeQueryDto): Promise<IncomeStatsDto> {
    const accounts = await this.ownedAccounts(userId, query.accountId);
    if (accounts.length === 0) return { totals: [], byPeriod: [], byAsset: [] };
    const rows = await this.events.find({ where: this.buildWhere(accounts, query) });

    // Доходность (подзадача 2.3): net / costBasis × 100 на ТЕКУЩЕЙ себестоимости
    // позиции (quantity × avgCostBasis). Приближение MVP: не исторический cost basis,
    // per-period yield не считается. Если позиции нет (полностью продана) — null.
    const positions = await this.positionsRepo.find({
      where: { accountId: In(accounts.map((a) => a.id)) },
    });
    const costByAsset = new Map<string, number>();
    const costByCurrency = new Map<string, number>();
    for (const p of positions) {
      const cost = Math.round(Number(p.quantity) * p.avgCostBasisAmount);
      costByAsset.set(p.assetId, (costByAsset.get(p.assetId) ?? 0) + cost);
      costByCurrency.set(p.currency, (costByCurrency.get(p.currency) ?? 0) + cost);
    }

    const withYield = (items: IncomeStatsItemDto[], costOf: (key: string) => number) =>
      items.map((item) => ({ ...item, yieldPct: this.yieldPct(item.net.amount, costOf(item.key)) }));

    return {
      totals: withYield(this.aggregate(rows, (e) => e.grossCurrency), (k) => costByCurrency.get(k) ?? 0),
      byPeriod: this.aggregate(rows, (e) => e.paymentDate.slice(0, 7)),
      byAsset: withYield(this.aggregate(rows, (e) => e.assetId), (k) => costByAsset.get(k) ?? 0),
    };
  }

  /** Счета пользователя; при фильтре по accountId — проверка владения (404). */
  private async ownedAccounts(userId: string, accountId?: string): Promise<Account[]> {
    if (accountId) return [await this.findAccount(userId, accountId)];
    return this.accounts.find({ where: { userId } });
  }

  private async findAccount(userId: string, accountId: string): Promise<Account> {
    const account = await this.accounts.findOne({ where: { id: accountId, userId } });
    if (!account) throw new NotFoundException('Счёт не найден');
    return account;
  }

  /** net / costBasis × 100, округление до 2 знаков; null при отсутствии позиции. */
  private yieldPct(net: number, costBasis: number): number | null {
    if (costBasis <= 0) return null;
    return Math.round((net / costBasis) * 100 * 100) / 100;
  }

  private requireCurrency(actual: string, expected: string, field: string): void {
    if (actual !== expected) {
      throw new BadRequestException(
        `Валюта ${field} должна совпадать с валютой счёта ${expected}`,
      );
    }
  }

  private buildWhere(
    accounts: Account[],
    query: ListIncomeQueryDto,
  ): FindOptionsWhere<IncomeEvent> {
    const where: FindOptionsWhere<IncomeEvent> = {
      accountId: In(accounts.map((a) => a.id)),
    };
    if (query.assetId) where.assetId = query.assetId;
    if (query.from || query.to) {
      where.paymentDate = Between(query.from ?? '0000-01-01', query.to ?? '9999-12-31');
    }
    return where;
  }

  /** Агрегация по группам; внутри группы суммы не смешиваются по валютам. */
  private aggregate(
    rows: IncomeEvent[],
    keyOf: (e: IncomeEvent) => string,
  ): IncomeStatsItemDto[] {
    const groups = new Map<
      string,
      { key: string; count: number; gross: number; tax: number; net: number; currency: string }
    >();
    for (const e of rows) {
      const key = keyOf(e);
      const groupKey = `${key}|${e.grossCurrency}`;
      const g = groups.get(groupKey) ?? {
        key,
        count: 0,
        gross: 0,
        tax: 0,
        net: 0,
        currency: e.grossCurrency,
      };
      g.count += 1;
      g.gross += e.grossAmount;
      g.tax += e.taxWithheldAmount ?? 0;
      g.net += e.netAmount;
      groups.set(groupKey, g);
    }
    return Array.from(groups.values()).map((g) => ({
      key: g.key,
      count: g.count,
      gross: { amount: g.gross, currency: g.currency },
      taxWithheld: { amount: g.tax, currency: g.currency },
      net: { amount: g.net, currency: g.currency },
    }));
  }

  private applyMoney(
    tx: Transaction,
    field: 'price' | 'amount',
    money: { amount: number; currency: string },
  ): void {
    // Поле сохраняется как два столбца: <field>_amount и <field>_currency.
    (tx as unknown as Record<string, unknown>)[`${field}Amount`] = money.amount;
    (tx as unknown as Record<string, unknown>)[`${field}Currency`] = money.currency;
  }

  private toDto(e: IncomeEvent): IncomeEventDto {
    const money = (field: 'gross' | 'taxWithheld' | 'net') => {
      const amount = (e as unknown as Record<string, unknown>)[`${field}Amount`];
      const currency = (e as unknown as Record<string, unknown>)[`${field}Currency`];
      if (amount == null || currency == null) return undefined as never;
      return { amount: amount as number, currency: currency as string };
    };
    return {
      id: e.id,
      assetId: e.assetId,
      accountId: e.accountId,
      type: e.type,
      announcementDate: e.announcementDate ?? undefined,
      exDate: e.exDate ?? undefined,
      recordDate: e.recordDate ?? undefined,
      paymentDate: e.paymentDate,
      grossAmount: money('gross'),
      taxWithheld: money('taxWithheld'),
      netAmount: money('net'),
      reinvested: e.reinvested,
      transactionId: e.transactionId ?? undefined,
    };
  }
}