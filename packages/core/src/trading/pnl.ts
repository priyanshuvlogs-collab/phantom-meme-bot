import { lamportsToSol, rawToUi } from "../constants.js";
import type { Position } from "../db/schema.js";

export interface PositionPnl {
  positionId: string;
  mint: string;
  symbol: string;
  /** Tokens held, UI units. */
  tokenAmountUi: number;
  entryPriceUsd: number;
  currentPriceUsd: number | undefined;
  /** Market value of the holdings, USD. */
  currentValueUsd: number | undefined;
  /** Cost basis of remaining holdings, SOL. */
  costBasisSol: number;
  unrealizedPnlUsd: number | undefined;
  unrealizedPnlPct: number | undefined;
  realizedPnlSol: number;
}

/**
 * PnL for a single position. Percentage is price-based (VWAP entry vs current
 * price); USD PnL uses the current market value against the USD value of the
 * entry. Both are estimates — actual exit value depends on slippage and
 * price impact at sell time.
 */
export function computePositionPnl(
  position: Position,
  currentPriceUsd: number | undefined,
): PositionPnl {
  const tokenAmountUi = rawToUi(position.tokenAmountRaw, position.decimals);
  const costBasisSol = lamportsToSol(position.solSpentLamports);

  let currentValueUsd: number | undefined;
  let unrealizedPnlUsd: number | undefined;
  let unrealizedPnlPct: number | undefined;

  if (currentPriceUsd !== undefined && position.status === "open") {
    currentValueUsd = tokenAmountUi * currentPriceUsd;
    const entryValueUsd = tokenAmountUi * position.entryPriceUsd;
    unrealizedPnlUsd = currentValueUsd - entryValueUsd;
    unrealizedPnlPct =
      position.entryPriceUsd > 0
        ? (currentPriceUsd / position.entryPriceUsd - 1) * 100
        : undefined;
  }

  return {
    positionId: position.id,
    mint: position.mint,
    symbol: position.symbol,
    tokenAmountUi,
    entryPriceUsd: position.entryPriceUsd,
    currentPriceUsd,
    currentValueUsd,
    costBasisSol,
    unrealizedPnlUsd,
    unrealizedPnlPct,
    realizedPnlSol: position.realizedPnlSol,
  };
}
