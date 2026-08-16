import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

/**
 * Raw token amounts are stored as strings (bigint-safe): SQLite integers and
 * JS numbers both lose precision beyond 2^53, which token base units exceed.
 */

export const positions = sqliteTable(
  "positions",
  {
    id: text("id").primaryKey(),
    mint: text("mint").notNull(),
    symbol: text("symbol").notNull().default("?"),
    decimals: integer("decimals").notNull(),
    mode: text("mode", { enum: ["paper", "live"] }).notNull(),
    status: text("status", { enum: ["open", "closed"] }).notNull().default("open"),

    /** Tokens currently held (base units, as string). */
    tokenAmountRaw: text("token_amount_raw").notNull(),
    /**
     * Cost basis of the tokens currently held (lamports, as string).
     * Reduced pro-rata on partial sells so PnL math stays consistent.
     */
    solSpentLamports: text("sol_spent_lamports").notNull(),
    /** Total SOL received from partial/full sells (lamports, as string). */
    solReceivedLamports: text("sol_received_lamports").notNull().default("0"),

    entryPriceUsd: real("entry_price_usd").notNull(),
    /** Highest observed price since entry — reserved for trailing stops. */
    highWaterPriceUsd: real("high_water_price_usd").notNull(),

    takeProfitPct: real("take_profit_pct"),
    stopLossPct: real("stop_loss_pct"),

    realizedPnlSol: real("realized_pnl_sol").notNull().default(0),

    openedAt: integer("opened_at", { mode: "timestamp_ms" }).notNull(),
    closedAt: integer("closed_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("idx_positions_status").on(t.status), index("idx_positions_mint").on(t.mint)],
);

export const trades = sqliteTable(
  "trades",
  {
    id: text("id").primaryKey(),
    positionId: text("position_id"),
    mint: text("mint").notNull(),
    symbol: text("symbol").notNull().default("?"),
    side: text("side", { enum: ["buy", "sell"] }).notNull(),
    mode: text("mode", { enum: ["paper", "live"] }).notNull(),
    status: text("status", { enum: ["simulated", "confirmed", "failed"] }).notNull(),
    /** What triggered the trade. */
    reason: text("reason", {
      enum: ["manual", "take_profit", "stop_loss", "dip_buy", "rise_sell"],
    }).notNull(),

    inputMint: text("input_mint").notNull(),
    outputMint: text("output_mint").notNull(),
    inAmountRaw: text("in_amount_raw").notNull(),
    outAmountRaw: text("out_amount_raw").notNull(),

    /** Token price (USD) at execution time. */
    priceUsd: real("price_usd"),
    txSignature: text("tx_signature"),
    error: text("error"),

    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("idx_trades_position").on(t.positionId), index("idx_trades_created").on(t.createdAt)],
);

/** Tokens the engine monitors for dip-buy / rise-sell rules. */
export const watchlist = sqliteTable("watchlist", {
  mint: text("mint").primaryKey(),
  symbol: text("symbol").notNull().default("?"),
  decimals: integer("decimals").notNull().default(9),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),

  /** Baseline price for percentage triggers; reset after each trigger. */
  referencePriceUsd: real("reference_price_usd"),
  referenceSetAt: integer("reference_set_at", { mode: "timestamp_ms" }),

  /** Buy when price drops this % below reference (null = disabled). */
  dipBuyPct: real("dip_buy_pct"),
  /** SOL to deploy per dip-buy trigger. */
  dipBuySizeSol: real("dip_buy_size_sol"),
  /** Sell when price rises this % above reference (null = disabled). */
  riseSellPct: real("rise_sell_pct"),
  /** Portion of the open position to sell on a rise trigger (default 100). */
  riseSellPortionPct: real("rise_sell_portion_pct"),
  /** Minimum ms between triggers for this token. */
  cooldownMs: integer("cooldown_ms").notNull().default(300_000),
  lastTriggeredAt: integer("last_triggered_at", { mode: "timestamp_ms" }),

  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

/** Rolling price history for the dashboard (pruned periodically). */
export const priceSnapshots = sqliteTable(
  "price_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    mint: text("mint").notNull(),
    priceUsd: real("price_usd").notNull(),
    at: integer("at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("idx_snapshots_mint_at").on(t.mint, t.at)],
);

/** Small key/value store: paper balance, daily loss tracking, engine status. */
export const kvStore = sqliteTable("kv_store", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export type Position = typeof positions.$inferSelect;
export type NewPosition = typeof positions.$inferInsert;
export type Trade = typeof trades.$inferSelect;
export type NewTrade = typeof trades.$inferInsert;
export type WatchlistItem = typeof watchlist.$inferSelect;
export type NewWatchlistItem = typeof watchlist.$inferInsert;
