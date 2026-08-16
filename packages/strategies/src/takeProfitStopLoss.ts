import {
  getOpenPositions,
  updateHighWater,
  type Position,
} from "@phantom-meme-bot/core";
import type { Strategy, StrategyContext } from "./types.js";

export type ExitSignal = "take_profit" | "stop_loss" | null;

/** Tolerance so exact-boundary moves trigger despite float rounding. */
export const PCT_EPSILON = 1e-9;

/**
 * Pure decision function — exported for unit testing.
 * Compares current price to the VWAP entry price.
 */
export function evaluateExit(position: Position, currentPriceUsd: number): ExitSignal {
  const { entryPriceUsd, takeProfitPct, stopLossPct } = position;
  if (entryPriceUsd <= 0) return null;
  const changePct = (currentPriceUsd / entryPriceUsd - 1) * 100;
  if (takeProfitPct != null && changePct >= takeProfitPct - PCT_EPSILON) return "take_profit";
  if (stopLossPct != null && changePct <= -stopLossPct + PCT_EPSILON) return "stop_loss";
  return null;
}

/**
 * Take Profit / Stop Loss — the core exit strategy.
 *
 * Every open position carries its own TP/SL thresholds (set at buy time,
 * defaulting to DEFAULT_TAKE_PROFIT_PCT / DEFAULT_STOP_LOSS_PCT). On each
 * tick the strategy closes any position whose price has moved past either
 * threshold.
 */
export class TakeProfitStopLossStrategy implements Strategy {
  readonly name = "tp-sl";

  requiredMints(): string[] {
    return getOpenPositions().map((p) => p.mint);
  }

  async tick(ctx: StrategyContext): Promise<void> {
    const positions = getOpenPositions(ctx.config.TRADING_MODE);
    for (const position of positions) {
      const price = ctx.prices.getCached(position.mint);
      if (!price) continue; // no data yet — never trade blind

      updateHighWater(position.id, price.priceUsd);

      const signal = evaluateExit(position, price.priceUsd);
      if (!signal) continue;

      ctx.log.info(
        {
          strategy: this.name,
          signal,
          mint: position.mint,
          symbol: position.symbol,
          entry: position.entryPriceUsd,
          current: price.priceUsd,
        },
        `${signal} triggered — closing position`,
      );
      try {
        await ctx.executor.sell({ positionIdOrMint: position.id, portionPct: 100, reason: signal });
      } catch (err) {
        ctx.log.error(
          { strategy: this.name, positionId: position.id, err: String(err) },
          "exit sell failed — will retry next tick",
        );
      }
    }
  }
}
