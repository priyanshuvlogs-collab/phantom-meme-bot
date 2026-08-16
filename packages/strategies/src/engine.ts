import {
  getLogger,
  loadConfig,
  prunePriceSnapshots,
  recordPriceSnapshot,
  PriceService,
  TradeExecutor,
  kvSet,
} from "@phantom-meme-bot/core";
import { DipBuyStrategy } from "./dipBuy.js";
import { RiseSellStrategy } from "./riseSell.js";
import { TakeProfitStopLossStrategy } from "./takeProfitStopLoss.js";
import type { Strategy, StrategyContext } from "./types.js";

const log = getLogger("engine");

const SNAPSHOT_RETENTION_MS = 24 * 60 * 60 * 1000;

/**
 * The strategy engine: a simple, robust interval loop.
 *
 * Design choice: no external queue (BullMQ/Redis). Ticks are cheap
 * (a price fetch + a few DB reads), strategies are idempotent per tick, and
 * an in-process loop keeps the Docker story to a single container. A guard
 * prevents overlapping ticks if one runs long.
 */
export class StrategyEngine {
  private readonly config = loadConfig();
  private readonly prices = new PriceService(this.config.PRICE_POLL_INTERVAL_MS);
  private readonly executor = new TradeExecutor();
  private readonly strategies: Strategy[];
  private timer: NodeJS.Timeout | undefined;
  private ticking = false;
  private stopped = false;

  constructor(strategies?: Strategy[]) {
    this.strategies = strategies ?? [
      new TakeProfitStopLossStrategy(),
      new RiseSellStrategy(),
      new DipBuyStrategy(),
    ];
  }

  async start(): Promise<void> {
    log.info(
      {
        mode: this.config.TRADING_MODE,
        strategies: this.strategies.map((s) => s.name),
        tickMs: this.config.STRATEGY_TICK_INTERVAL_MS,
        priceMs: this.config.PRICE_POLL_INTERVAL_MS,
      },
      this.config.isPaper
        ? "engine starting in PAPER mode (simulated fills, no real transactions)"
        : "engine starting in LIVE mode — REAL FUNDS AT RISK",
    );

    this.prices.on("update", (u: { mint: string; priceUsd: number }) => {
      try {
        recordPriceSnapshot(u.mint, u.priceUsd);
      } catch (err) {
        log.warn({ err: String(err) }, "failed to record price snapshot");
      }
    });

    this.refreshTrackedMints();
    this.prices.start();
    await this.tick(); // immediate first tick

    this.timer = setInterval(() => void this.tick(), this.config.STRATEGY_TICK_INTERVAL_MS);
    kvSet("engine_status", JSON.stringify({ running: true, startedAt: Date.now() }));
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.prices.stop();
    kvSet("engine_status", JSON.stringify({ running: false, stoppedAt: Date.now() }));
    log.info("engine stopped");
  }

  private refreshTrackedMints(): void {
    for (const strategy of this.strategies) {
      try {
        this.prices.track(...strategy.requiredMints());
      } catch (err) {
        log.warn({ strategy: strategy.name, err: String(err) }, "requiredMints failed");
      }
    }
  }

  private async tick(): Promise<void> {
    if (this.ticking || this.stopped) return;
    this.ticking = true;
    const startedAt = Date.now();
    try {
      this.refreshTrackedMints();

      const ctx: StrategyContext = {
        config: this.config,
        prices: this.prices,
        executor: this.executor,
        log,
        now: Date.now(),
      };

      // Strategies run sequentially: exits (tp-sl, rise-sell) before entries
      // (dip-buy) so freed capital and position slots are available same-tick.
      for (const strategy of this.strategies) {
        try {
          await strategy.tick(ctx);
        } catch (err) {
          log.error({ strategy: strategy.name, err: String(err) }, "strategy tick failed");
        }
      }

      prunePriceSnapshots(SNAPSHOT_RETENTION_MS);
      kvSet("engine_last_tick", String(Date.now()));
    } finally {
      this.ticking = false;
      log.debug({ durationMs: Date.now() - startedAt }, "tick complete");
    }
  }
}
