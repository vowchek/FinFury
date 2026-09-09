import { TransactionType } from '@finfury/contracts';

/** Вход для расчёта позиций (минимальный срез транзакции без полей персистенции). */
export interface CostTransactionInput {
  assetId: string;
  type: TransactionType;
  /** Дробное количество (в штуках). >= 0 для входящих сделок. */
  quantity: number;
  /** Цена за штуку в минимальных единицах (int). null для неценовых типов. */
  priceMinors: number | null;
}

/** Результат агрегации по одному активу. */
export interface CalculatedPositionAsset {
  assetId: string;
  quantity: number;
  /** Средняя стоимость в минимальных единицах за штуку (Math.round). */
  avgCostBasisMinors: number;
}

interface Moving {
  quantity: number;
  avgCost: number;
}

/**
 * Расчёт AVCO (moving average) по транзакциям, сгруппированным по active (assetId).
 *
 * - `buy`/`opening` увеличивают количество и пересчитывают среднюю стоимость.
 * - `sell` уменьшает количество, средняя стоимость не меняется (AVCO).
 * - Деньги — целые минимальные единицы; операция `qty*price` точная при целых `quantity`.
 *
 * Возвращает по одному `CalculatedPositionAsset` на каждый актив, по которому есть
 * buy/opening или открытая sell-позиция.
 */
export function calculateAverageCostBasis(
  transactions: CostTransactionInput[],
): CalculatedPositionAsset[] {
  const groups = new Map<string, Moving>();

  for (const tx of transactions) {
    const g = groups.get(tx.assetId);

    if (tx.type === TransactionType.SELL) {
      if (g) g.quantity -= tx.quantity;
      continue;
    }

    if (tx.type !== TransactionType.BUY && tx.type !== TransactionType.OPENING) continue;
    if (tx.priceMinors === null || tx.priceMinors < 0) continue;

    const cur = g ?? { quantity: 0, avgCost: 0 };
    const newQty = cur.quantity + tx.quantity;
    // AVCO: (старое qty*avg + qty*цена) / (новое qty)
    cur.avgCost = newQty > 0 ? Math.round((cur.quantity * cur.avgCost + tx.quantity * tx.priceMinors) / newQty) : 0;
    cur.quantity = newQty;
    groups.set(tx.assetId, cur);
  }

  return Array.from(groups.entries()).map(([assetId, g]) => ({
    assetId,
    quantity: g.quantity,
    avgCostBasisMinors: g.avgCost,
  }));
}