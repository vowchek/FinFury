import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LotDto } from '@finfury/contracts';
import { FindOptionsWhere, In, Repository } from 'typeorm';
import { Account } from '../accounts/account.entity';
import { Position } from '../positions/position.entity';
import { Transaction } from '../transactions/transaction.entity';
import { calculateLots, InsufficientLotsError, LotTransactionInput } from './lot-calculator';
import { Lot } from './lot.entity';

/**
 * Партии (cost basis по FIFO, подзадача 2.3) — производный кэш, как `positions`.
 * `recalcForAccount` выполняется строго ПОСЛЕ `PositionsService.recalcForAccount`
 * (партии ссылаются на `positionId` из кэша позиций).
 */
@Injectable()
export class LotsService {
  constructor(
    @InjectRepository(Lot)
    private readonly lots: Repository<Lot>,
    @InjectRepository(Position)
    private readonly positions: Repository<Position>,
    @InjectRepository(Transaction)
    private readonly transactions: Repository<Transaction>,
    @InjectRepository(Account)
    private readonly accounts: Repository<Account>,
  ) {}

  /**
   * Пересчитывает партии счёта из транзакций (FIFO) и синхронизирует кэш-таблицу `lots`.
   * Записывает `realizedPnl` в sell-транзакции (столбцы `realized_pnl_*`).
   */
  async recalcForAccount(accountId: string, currency: string): Promise<void> {
    const txs = await this.transactions.find({
      where: { accountId },
      order: { date: 'ASC', createdAt: 'ASC' },
    });

    const inputs: LotTransactionInput[] = txs
      .filter((t) => t.assetId)
      .map((t) => ({
        id: t.id,
        assetId: t.assetId as string,
        type: t.type,
        date: t.date,
        quantity: t.quantity === null ? 0 : Number(t.quantity),
        priceMinors: t.priceAmount,
        amountMinors: t.amountAmount,
        feeMinors: t.feeAmount,
        taxMinors: t.taxAmount,
      }));

    let result: ReturnType<typeof calculateLots>;
    try {
      result = calculateLots(inputs);
    } catch (e) {
      if (e instanceof InsufficientLotsError) throw new BadRequestException(e.message);
      throw e;
    }

    // id позиции берём из кэша positions (пересчитан ранее)
    const positions = await this.positions.find({ where: { accountId } });
    const positionByAsset = new Map(positions.map((p) => [p.assetId, p.id]));

    // Синхронизация кэша lots: удаляем все партии счёта и вставляем актуальные.
    // Полностью проданные активы остаются без партий (позиция с quantity 0 удаляется
    // в positions.recalcForAccount, партии каскадно удаляются по FK).
    if (positions.length > 0) {
      await this.lots.delete({ positionId: In(positions.map((p) => p.id)) });
      const rows = result.lots
        .filter((l) => positionByAsset.has(l.assetId))
        .map(
          (l) =>
            ({
              positionId: positionByAsset.get(l.assetId),
              quantity: String(l.quantity),
              costBasisAmount: l.costBasisMinors,
              costBasisCurrency: currency,
              acquiredAt: l.acquiredAt,
            }) as Partial<Lot>,
        );
      if (rows.length > 0) await this.lots.save(rows);
    }

    // realizedPnl: очищаем у всех транзакций счёта, затем пишем актуальные sell.
    await this.transactions.update(
      { accountId },
      { realizedPnlAmount: null, realizedPnlCurrency: null },
    );
    for (const pnl of result.realizedPnl) {
      await this.transactions.update(
        { id: pnl.transactionId },
        { realizedPnlAmount: pnl.realizedPnlMinors, realizedPnlCurrency: currency },
      );
    }
  }

  /** Партии счёта (изоляция по userId), опционально по активу. */
  async list(userId: string, accountId: string, assetId?: string): Promise<LotDto[]> {
    const account = await this.accounts.findOne({ where: { id: accountId, userId } });
    if (!account) throw new NotFoundException('Счёт не найден');

    const where: FindOptionsWhere<Position> = { accountId };
    if (assetId) where.assetId = assetId;
    const positions = await this.positions.find({ where });
    if (positions.length === 0) return [];

    const lots = await this.lots.find({
      where: { positionId: In(positions.map((p) => p.id)) },
      order: { acquiredAt: 'ASC', createdAt: 'ASC' },
    });
    const positionById = new Map(positions.map((p) => [p.id, p]));

    return lots.flatMap((l) => {
      const pos = positionById.get(l.positionId);
      if (!pos) return []; // партия без позиции (не должно случаться) — пропускаем
      return [{
        id: l.id,
        positionId: l.positionId,
        assetId: pos.assetId,
        accountId: pos.accountId,
        quantity: Number(l.quantity),
        costBasis: { amount: l.costBasisAmount, currency: l.costBasisCurrency },
        acquiredAt: l.acquiredAt,
        createdAt: l.createdAt.toISOString(),
      }];
    });
  }

  /**
   * Доступное количество актива для продажи (Σ остатков партий по текущему кэшу).
   * Используется для валидации продажи (400 при недостатке).
   */
  async availableQuantity(accountId: string, assetId: string): Promise<number> {
    const positions = await this.positions.find({ where: { accountId, assetId } });
    if (positions.length === 0) return 0;
    const lots = await this.lots.find({
      where: { positionId: In(positions.map((p) => p.id)) },
    });
    return lots.reduce((sum, l) => sum + Number(l.quantity), 0);
  }
}