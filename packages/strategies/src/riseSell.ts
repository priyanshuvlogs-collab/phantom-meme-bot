import {
  getOpenPositionByMint,
  getWatchlist,
  setWatchlistReference,
  type WatchlistItem,
} from "@phantom-meme-bot/core";
import { PCT_EPSILON } from "./takeProfitStopLoss.js";
import type { Strategy, StrategyContext } from "./types.js";

/** Pure decision function — exported for unit testing. */
export function shouldRiseSell(
  item: WatchlistItem,
  currentPriceUsd: number,
  now: number,
): boolean {
  if (!item.enabled || item.riseSellPct == null) return false;
  if (item.referencePriceUsd == null || item.referencePriceUsd <= 0) return false;
  if (item.lastTriggeredAt && now - item.lastTriggeredAt.getTime() < item.cooldownMs) return false;
  const risePct = (currentPriceUsd / item.referencePriceUsd - 1) * 100;
  return risePct >= item.riseSellPct - PCT_EPSILON;
}

/**
 * Sell-on-rise strategy (ladder out into strength).
 *
 * For watchlist entries with a `riseSellPct`: when the price rises that far
 * above the reference and we hold an open position in the token, sell
 * `riseSellPortionPct`% of it (default 100%), then reset the reference so
 * repeated legs up keep laddering out.
 *
 * Complements TP/SL: TP/SL is anchored to *your entry*, rise-sell is anchored
 * to a *rolling reference*, letting you take profit in tranches.
 */
export class RiseSellStrategy implements Strategy {
  readonly name = "rise-sell";

  requiredMints(): string[] {
    return getWatchlist(true)
      .filter((w) => w.riseSellPct != null)
      .map((w) => w.mint);
  }

  async tick(ctx: StrategyContext): Promise<void> {
    for (const item of getWatchlist(true)) {
      if (item.riseSellPct == null) continue;
      const price = ctx.prices.getCached(item.mint);
      if (!price) continue;

      if (item.referencePriceUsd == null) {
        setWatchlistReference(item.mint, price.priceUsd);
        continue;
      }

      if (!shouldRiseSell(item, price.priceUsd, ctx.now)) continue;

      const position = getOpenPositionByMint(item.mint, ctx.config.TRADING_MODE);
      if (!position) {
        // Nothing held — just ratchet the reference upward.
        setWatchlistReference(item.mint, price.priceUsd);
        continue;
      }

      const portion = item.riseSellPortionPct ?? 100;
      ctx.log.info(
        {
          strategy: this.name,
          mint: item.mint,
          symbol: item.symbol,
          reference: item.referencePriceUsd,
          current: price.priceUsd,
          portionPct: portion,
        },
        "rise threshold hit — selling",
      );
      try {
        await ctx.executor.sell({
          positionIdOrMint: position.id,
          portionPct: portion,
          reason: "rise_sell",
        });
        setWatchlistReference(item.mint, price.priceUsd, true);
      } catch (err) {
        ctx.log.error(
          { strategy: this.name, mint: item.mint, err: String(err) },
          "rise sell failed — will retry next tick",
        );
      }
    }
  }
}
