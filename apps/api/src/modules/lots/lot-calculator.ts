import { TransactionType } from '@finfury/contracts';

/** Вход для расчёта партий (минимальный срез транзакции без полей персистенции). */
export interface LotTransactionInput {
  id: string;
  assetId: string;
  type: TransactionType;
  date: string;
  /** Дробное количество (в штуках). */
  quantity: number;
  /** Цена за штуку в минимальных единицах (int). null для неценовых типов. */
  priceMinors: number | null;
  /** Сумма сделки в минимальных единицах (int). */
  amountMinors: number | null;
  feeMinors: number | null;
  taxMinors: number | null;
}

/** Остаток партии после пересчёта. */
export interface CalculatedLot {
  assetId: string;
  quantity: number;
  /** Cost basis за штуку в минимальных единицах. */
  costBasisMinors: number;
  acquiredAt: string;
}

/** Реализованная прибыль одной sell-транзакции. */
export interface SellRealizedPnl {
  transactionId: string;
  realizedPnlMinors: number;
}

export interface LotCalculationResult {
  lots: CalculatedLot[];
  realizedPnl: SellRealizedPnl[];
}

/** Продажа сверх доступных партий (FIFO). */
export class InsufficientLotsError extends Error {
  constructor(assetId: string) {
    super(`Недостаточно партий для продажи (актив ${assetId})`);
  }
}

interface LotState {
  quantity: number;
  costBasisMinors: number;
  acquiredAt: string;
}

/**
 * Расчёт партий по FIFO и реализованной прибыли (подзадача 2.3).
 *
 * Вход — транзакции счёта в хронологическом порядке (date ASC, createdAt ASC).
 * Обработка по каждому активу:
 * - `buy`/`opening` → создают партию (`costBasis = price`, `acquiredAt = date`);
 *   `opening` трактуется как buy (единообразно с AVCO-калькулятором, ADR-003).
 * - `sell` → списание по FIFO (старейшие партии первыми, частичное списание
 *   дробит партию); `realizedPnl` = выручка − списанная себестоимость,
 *   где выручка = `amount − fee − tax`, списанная себестоимость =
 *   Σ(списанное количество × costBasis партии).
 * - Продажа сверх остатка партий → `InsufficientLotsError`.
 *
 * Деньги — целые минимальные единицы; `realizedPnl` округляется до целого.
 */
export function calculateLots(transactions: LotTransactionInput[]): LotCalculationResult {
  const byAsset = new Map<string, LotTransactionInput[]>();
  for (const t of transactions) {
    if (!t.assetId) continue;
    const list = byAsset.get(t.assetId) ?? [];
    list.push(t);
    byAsset.set(t.assetId, list);
  }

  const lots: CalculatedLot[] = [];
  const realizedPnl: SellRealizedPnl[] = [];

  for (const [assetId, txs] of byAsset) {
    const assetLots: LotState[] = [];

    for (const tx of txs) {
      if (tx.type === TransactionType.BUY || tx.type === TransactionType.OPENING) {
        if (tx.priceMinors === null || tx.priceMinors < 0 || tx.quantity <= 0) continue;
        assetLots.push({
          quantity: tx.quantity,
          costBasisMinors: tx.priceMinors,
          acquiredAt: tx.date,
        });
        continue;
      }

      if (tx.type === TransactionType.SELL) {
        let remaining = tx.quantity;
        let consumedCost = 0;
        for (const lot of assetLots) {
          if (remaining <= 0) break;
          const take = Math.min(lot.quantity, remaining);
          consumedCost += take * lot.costBasisMinors;
          lot.quantity -= take;
          remaining -= take;
        }
        if (remaining > 0) {
          throw new InsufficientLotsError(assetId);
        }
        // убираем полностью списанные партии (частично списанные остаются — дробление)
        for (let i = assetLots.length - 1; i >= 0; i--) {
          if (assetLots[i].quantity <= 0) assetLots.splice(i, 1);
        }
        const proceeds = (tx.amountMinors ?? 0) - (tx.feeMinors ?? 0) - (tx.taxMinors ?? 0);
        realizedPnl.push({
          transactionId: tx.id,
          realizedPnlMinors: Math.round(proceeds - consumedCost),
        });
      }
    }

    for (const lot of assetLots) {
      if (lot.quantity > 0) {
        lots.push({
          assetId,
          quantity: lot.quantity,
          costBasisMinors: lot.costBasisMinors,
          acquiredAt: lot.acquiredAt,
        });
      }
    }
  }

  return { lots, realizedPnl };
}