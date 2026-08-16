import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { loadConfig } from "../config.js";
import * as schema from "./schema.js";

export type Db = BetterSQLite3Database<typeof schema>;

let db: Db | undefined;

/**
 * Opens (and lazily creates) the SQLite database. Schema is applied via
 * `CREATE TABLE IF NOT EXISTS` on startup so a fresh clone works with zero
 * setup steps — `drizzle-kit push` remains available for schema evolution.
 */
export function getDb(): Db {
  if (db) return db;

  const config = loadConfig();
  fs.mkdirSync(path.dirname(config.databaseFile), { recursive: true });

  const sqlite = new Database(config.databaseFile);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  applySchema(sqlite);

  db = drizzle(sqlite, { schema });
  return db;
}

function applySchema(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS positions (
      id TEXT PRIMARY KEY,
      mint TEXT NOT NULL,
      symbol TEXT NOT NULL DEFAULT '?',
      decimals INTEGER NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      token_amount_raw TEXT NOT NULL,
      sol_spent_lamports TEXT NOT NULL,
      sol_received_lamports TEXT NOT NULL DEFAULT '0',
      entry_price_usd REAL NOT NULL,
      high_water_price_usd REAL NOT NULL,
      take_profit_pct REAL,
      stop_loss_pct REAL,
      realized_pnl_sol REAL NOT NULL DEFAULT 0,
      opened_at INTEGER NOT NULL,
      closed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_positions_status ON positions(status);
    CREATE INDEX IF NOT EXISTS idx_positions_mint ON positions(mint);

    CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY,
      position_id TEXT,
      mint TEXT NOT NULL,
      symbol TEXT NOT NULL DEFAULT '?',
      side TEXT NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL,
      reason TEXT NOT NULL,
      input_mint TEXT NOT NULL,
      output_mint TEXT NOT NULL,
      in_amount_raw TEXT NOT NULL,
      out_amount_raw TEXT NOT NULL,
      price_usd REAL,
      tx_signature TEXT,
      error TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_trades_position ON trades(position_id);
    CREATE INDEX IF NOT EXISTS idx_trades_created ON trades(created_at);

    CREATE TABLE IF NOT EXISTS watchlist (
      mint TEXT PRIMARY KEY,
      symbol TEXT NOT NULL DEFAULT '?',
      decimals INTEGER NOT NULL DEFAULT 9,
      enabled INTEGER NOT NULL DEFAULT 1,
      reference_price_usd REAL,
      reference_set_at INTEGER,
      dip_buy_pct REAL,
      dip_buy_size_sol REAL,
      rise_sell_pct REAL,
      rise_sell_portion_pct REAL,
      cooldown_ms INTEGER NOT NULL DEFAULT 300000,
      last_triggered_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS price_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mint TEXT NOT NULL,
      price_usd REAL NOT NULL,
      at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_snapshots_mint_at ON price_snapshots(mint, at);

    CREATE TABLE IF NOT EXISTS kv_store (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
}

/** Test helper — close and forget the cached connection. */
export function resetDbCache(): void {
  db = undefined;
}
