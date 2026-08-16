import type { BotConfig, Logger, PriceService, TradeExecutor } from "@phantom-meme-bot/core";

/** Shared services handed to every strategy on each tick. */
export interface StrategyContext {
  config: BotConfig;
  prices: PriceService;
  executor: TradeExecutor;
  log: Logger;
  now: number;
}

/**
 * A strategy is a stateless-per-tick decision unit: it reads current market
 * and portfolio state and may instruct the executor to trade. Keeping
 * strategies side-effect-light makes them easy to unit test and safe to
 * re-run after crashes.
 */
export interface Strategy {
  readonly name: string;
  /** Mints this strategy needs price data for (called each tick). */
  requiredMints(): string[];
  tick(ctx: StrategyContext): Promise<void>;
}
