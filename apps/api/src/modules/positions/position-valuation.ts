/** Вход для оценки позиции (минимальные единицы, целые). */
export interface PositionValuationInput {
  /** Дробное количество (в штуках). */
  quantity: number;
  /** Средняя стоимость за штуку в минимальных единицах (int). */
  avgCostBasisMinors: number;
  /** Текущая цена за штуку в минимальных единицах (int). */
  currentPriceMinors: number;
}

/** Результат оценки позиции (все суммы — целые минимальные единицы). */
export interface PositionValuation {
  currentValueMinors: number;
  costBasisMinors: number;
  unrealizedPnlMinors: number;
}

/**
 * Оценка позиции по текущей цене (TASK-6).
 * Деньги — целые минимальные единицы (ADR-002); количество дробное,
 * поэтому произведение округляется до ближайшего целого.
 * unrealizedPnl = currentValue − costBasis (AVCO по всем штукам).
 */
export function valuePosition(input: PositionValuationInput): PositionValuation {
  const currentValueMinors = Math.round(input.quantity * input.currentPriceMinors);
  const costBasisMinors = Math.round(input.quantity * input.avgCostBasisMinors);
  return {
    currentValueMinors,
    costBasisMinors,
    unrealizedPnlMinors: currentValueMinors - costBasisMinors,
  };
}