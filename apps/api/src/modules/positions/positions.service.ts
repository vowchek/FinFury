import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { Transaction } from '../transactions/transaction.entity';
import { Position } from './position.entity';
import { calculateAverageCostBasis, CostTransactionInput } from './position-calculator';

/**
 * Пересчёт позиций из транзакций (ADR-003: позиции — производная, НЕ источник истины).
 * Агрегирует по (account, asset): quantity и avg cost basis по AVCO (TASK-2).
 * После пересчёта записывает результат в кэш-таблицу `positions`
 * и удаляет записи активов, по которым больше нет остатка.
 */
@Injectable()
export class PositionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionsRepo: Repository<Transaction>,
    @InjectRepository(Position)
    private readonly positionsRepo: Repository<Position>,
  ) {}

  /**
   * Пересчитывает позиции конкретного счёта и синхронизирует кэш-таблицу.
   * `opening`-транзакции участвуют в количестве и AVCO (как buy), но не
   * рассматриваются как обычные сделки для реализованной прибыли.
   */
  async recalcForAccount(accountId: string, currency: string): Promise<Position[]> {
    const txs = await this.transactionsRepo.find({ where: { accountId } });

    const inputs: CostTransactionInput[] = txs.map((t) => ({
      assetId: t.assetId as string, // buy/opening всегда имеют assetId
      type: t.type,
      quantity: t.quantity === null ? 0 : Number(t.quantity),
      priceMinors: t.priceAmount,
    }));
    // игнорируем денежные типы без актива
    // (фильтрация игнорится в калькуляторе, но избегаем null assetId)

    const result = calculateAverageCostBasis(inputs.filter((i) => i.assetId));

    // upsert: на каждый актив-позицию обновляем, отсутствующие удаляем
    const assetIds = result.map((r) => r.assetId);
    if (assetIds.length === 0) {
      await this.positionsRepo.delete({ accountId });
      return [];
    }

    await this.positionsRepo.delete({ accountId, assetId: Not(In(assetIds)) });
    const positionRows = result.map(
      (r) =>
        ({
          accountId,
          assetId: r.assetId,
          quantity: String(r.quantity),
          avgCostBasisAmount: r.avgCostBasisMinors,
          avgCostBasisCurrency: currency,
          currency,
        }) as Partial<Position>,
    );
    await this.positionsRepo.upsert(positionRows, {
      conflictPaths: ['accountId', 'assetId'],
    });
    return this.positionsRepo.findBy({ accountId });
  }
}