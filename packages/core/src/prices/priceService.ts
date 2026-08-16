import { EventEmitter } from "node:events";
import { getJupiterClient } from "../jupiter/client.js";
import { getLogger } from "../logger.js";

const log = getLogger("prices");

export interface PriceUpdate {
  mint: string;
  priceUsd: number;
  at: number;
}

/**
 * Polls Jupiter's Price API for a dynamic set of mints and caches the latest
 * values. Strategies read from the cache; the dashboard and CLI can subscribe
 * to `update` events for real-time display.
 */
export class PriceService extends EventEmitter {
  private readonly latest = new Map<string, PriceUpdate>();
  private readonly tracked = new Set<string>();
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly pollIntervalMs: number) {
    super();
  }

  track(...mints: string[]): void {
    for (const mint of mints) this.tracked.add(mint);
  }

  untrack(mint: string): void {
    this.tracked.delete(mint);
  }

  getTracked(): string[] {
    return [...this.tracked];
  }

  /** Latest cached price; may be undefined until the first poll completes. */
  getCached(mint: string): PriceUpdate | undefined {
    return this.latest.get(mint);
  }

  /** Fetch prices immediately (also refreshes the cache). */
  async fetchNow(mints?: string[]): Promise<Map<string, number>> {
    const targets = mints ?? [...this.tracked];
    if (targets.length === 0) return new Map();
    const prices = await getJupiterClient().getUsdPrices(targets);
    const at = Date.now();
    for (const [mint, priceUsd] of prices) {
      const update: PriceUpdate = { mint, priceUsd, at };
      this.latest.set(mint, update);
      this.emit("update", update);
    }
    return prices;
  }

  start(): void {
    if (this.timer) return;
    const tick = async () => {
      try {
        await this.fetchNow();
      } catch (err) {
        log.warn({ err: String(err) }, "price poll failed");
        this.emit("error", err);
      }
    };
    void tick();
    this.timer = setInterval(tick, this.pollIntervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
