import {
  getWatchlist,
  setWatchlistReference,
  type WatchlistItem,
} from "@phantom-meme-bot/core";
import { PCT_EPSILON } from "./takeProfitStopLoss.js";
import type { Strategy, StrategyContext } from "./types.js";

/** Pure decision function — exported for unit testing. */
export function shouldDipBuy(
  item: WatchlistItem,
  currentPriceUsd: number,
  now: number,
): boolean {
  if (!item.enabled || item.dipBuyPct == null || !item.dipBuySizeSol) return false;
  if (item.referencePriceUsd == null || item.referencePriceUsd <= 0) return false;
  if (item.lastTriggeredAt && now - item.lastTriggeredAt.getTime() < item.cooldownMs) return false;
  const dropPct = (1 - currentPriceUsd / item.referencePriceUsd) * 100;
  return dropPct >= item.dipBuyPct - PCT_EPSILON;
}

/**
 * Buy-the-dip strategy.
 *
 * For each watchlist entry with a `dipBuyPct`, the strategy tracks a
 * reference price (initialized to the first observed price). When the price
 * drops `dipBuyPct`% below the reference it buys `dipBuySizeSol` SOL worth,
 * then resets the reference to the fill area and starts a cooldown so a
 * continued crash doesn't chain-buy into a rug.
 *
 * All buys still pass the safety filters and global risk caps in the
 * executor.
 */
export class DipBuyStrategy implements Strategy {
  readonly name = "dip-buy";

  requiredMints(): string[] {
    return getWatchlist(true)
      .filter((w) => w.dipBuyPct != null)
      .map((w) => w.mint);
  }

  async tick(ctx: StrategyContext): Promise<void> {
    for (const item of getWatchlist(true)) {
      if (item.dipBuyPct == null) continue;
      const price = ctx.prices.getCached(item.mint);
      if (!price) continue;

      // First sighting: set the baseline, don't trade.
      if (item.referencePriceUsd == null) {
        setWatchlistReference(item.mint, price.priceUsd);
        continue;
      }

      if (!shouldDipBuy(item, price.priceUsd, ctx.now)) continue;

      ctx.log.info(
        {
          strategy: this.name,
          mint: item.mint,
          symbol: item.symbol,
          reference: item.referencePriceUsd,
          current: price.priceUsd,
          sizeSol: item.dipBuySizeSol,
        },
        "dip threshold hit — buying",
      );
      try {
        await ctx.executor.buy({
          mint: item.mint,
          solAmount: item.dipBuySizeSol!,
          reason: "dip_buy",
        });
        setWatchlistReference(item.mint, price.priceUsd, true);
      } catch (err) {
        ctx.log.warn(
          { strategy: this.name, mint: item.mint, err: String(err) },
          "dip buy rejected",
        );
        // Reset the reference anyway so a token in freefall doesn't retrigger
        // on every tick after a safety/risk rejection.
        setWatchlistReference(item.mint, price.priceUsd, true);
      }
    }
  }
}
