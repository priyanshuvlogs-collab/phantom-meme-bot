import { randomUUID } from "node:crypto";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { loadConfig } from "../config.js";
import { solToLamports } from "../constants.js";
import { getDb } from "./client.js";
import {
  kvStore,
  positions,
  priceSnapshots,
  trades,
  watchlist,
  type NewTrade,
  type NewWatchlistItem,
  type Position,
  type Trade,
  type WatchlistItem,
} from "./schema.js";

/** Thin repository over Drizzle — keeps SQL concerns out of trading logic. */

// ---------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------

export function getOpenPositions(mode?: "paper" | "live"): Position[] {
  const db = getDb();
  const where = mode
    ? and(eq(positions.status, "open"), eq(positions.mode, mode))
    : eq(positions.status, "open");
  return db.select().from(positions).where(where).orderBy(desc(positions.openedAt)).all();
}

export function getAllPositions(limit = 100): Position[] {
  return getDb().select().from(positions).orderBy(desc(positions.openedAt)).limit(limit).all();
}

export function getPosition(id: string): Position | undefined {
  return getDb().select().from(positions).where(eq(positions.id, id)).get();
}

export function getOpenPositionByMint(mint: string, mode: "paper" | "live"): Position | undefined {
  return getDb()
    .select()
    .from(positions)
    .where(and(eq(positions.mint, mint), eq(positions.status, "open"), eq(positions.mode, mode)))
    .get();
}

export interface OpenPositionInput {
  mint: string;
  symbol: string;
  decimals: number;
  mode: "paper" | "live";
  tokenAmountRaw: bigint;
  solSpentLamports: bigint;
  entryPriceUsd: number;
  takeProfitPct: number | null;
  stopLossPct: number | null;
}

export function openPosition(input: OpenPositionInput): Position {
  const db = getDb();
  const row = {
    id: randomUUID(),
    mint: input.mint,
    symbol: input.symbol,
    decimals: input.decimals,
    mode: input.mode,
    status: "open" as const,
    tokenAmountRaw: input.tokenAmountRaw.toString(),
    solSpentLamports: input.solSpentLamports.toString(),
    solReceivedLamports: "0",
    entryPriceUsd: input.entryPriceUsd,
    highWaterPriceUsd: input.entryPriceUsd,
    takeProfitPct: input.takeProfitPct,
    stopLossPct: input.stopLossPct,
    realizedPnlSol: 0,
    openedAt: new Date(),
  };
  db.insert(positions).values(row).run();
  return getPosition(row.id)!;
}

/** Add to an existing open position (averaging in). */
export function increasePosition(
  id: string,
  addedTokensRaw: bigint,
  addedSolLamports: bigint,
  fillPriceUsd: number,
): void {
  const db = getDb();
  const pos = getPosition(id);
  if (!pos) throw new Error(`position ${id} not found`);

  const oldTokens = BigInt(pos.tokenAmountRaw);
  const newTokens = oldTokens + addedTokensRaw;
  // Volume-weighted entry price.
  const oldUi = Number(oldTokens);
  const addedUi = Number(addedTokensRaw);
  const newEntry =
    newTokens === 0n
      ? pos.entryPriceUsd
      : (pos.entryPriceUsd * oldUi + fillPriceUsd * addedUi) / (oldUi + addedUi);

  db.update(positions)
    .set({
      tokenAmountRaw: newTokens.toString(),
      solSpentLamports: (BigInt(pos.solSpentLamports) + addedSolLamports).toString(),
      entryPriceUsd: newEntry,
      highWaterPriceUsd: Math.max(pos.highWaterPriceUsd, fillPriceUsd),
    })
    .where(eq(positions.id, id))
    .run();
}

/** Reduce (or close) a position after a sell fill. */
export function reducePosition(
  id: string,
  soldTokensRaw: bigint,
  receivedSolLamports: bigint,
): Position {
  const db = getDb();
  const pos = getPosition(id);
  if (!pos) throw new Error(`position ${id} not found`);

  const held = BigInt(pos.tokenAmountRaw);
  const remaining = held - soldTokensRaw < 0n ? 0n : held - soldTokensRaw;

  // Realized PnL: SOL received minus the pro-rata share of the cost basis.
  const spent = BigInt(pos.solSpentLamports);
  const costBasisLamports = held === 0n ? 0n : (spent * soldTokensRaw) / held;
  const realizedDeltaSol = Number(receivedSolLamports - costBasisLamports) / 1e9;

  const closed = remaining === 0n;
  db.update(positions)
    .set({
      tokenAmountRaw: remaining.toString(),
      solSpentLamports: (spent - costBasisLamports).toString(),
      solReceivedLamports: (BigInt(pos.solReceivedLamports) + receivedSolLamports).toString(),
      realizedPnlSol: pos.realizedPnlSol + realizedDeltaSol,
      status: closed ? "closed" : "open",
      closedAt: closed ? new Date() : null,
    })
    .where(eq(positions.id, id))
    .run();

  if (realizedDeltaSol < 0) addDailyRealizedLoss(-realizedDeltaSol);
  return getPosition(id)!;
}

export function updateHighWater(id: string, priceUsd: number): void {
  getDb()
    .update(positions)
    .set({ highWaterPriceUsd: priceUsd })
    .where(and(eq(positions.id, id), lt(positions.highWaterPriceUsd, priceUsd)))
    .run();
}

// ---------------------------------------------------------------------------
// Trades
// ---------------------------------------------------------------------------

export function recordTrade(input: Omit<NewTrade, "id" | "createdAt">): Trade {
  const db = getDb();
  const row = { ...input, id: randomUUID(), createdAt: new Date() };
  db.insert(trades).values(row).run();
  return db.select().from(trades).where(eq(trades.id, row.id)).get()!;
}

export function getRecentTrades(limit = 50): Trade[] {
  return getDb().select().from(trades).orderBy(desc(trades.createdAt)).limit(limit).all();
}

// ---------------------------------------------------------------------------
// Watchlist
// ---------------------------------------------------------------------------

export function upsertWatchlistItem(item: Omit<NewWatchlistItem, "createdAt">): WatchlistItem {
  const db = getDb();
  const existing = db.select().from(watchlist).where(eq(watchlist.mint, item.mint)).get();
  if (existing) {
    db.update(watchlist).set(item).where(eq(watchlist.mint, item.mint)).run();
  } else {
    db.insert(watchlist)
      .values({ ...item, createdAt: new Date() })
      .run();
  }
  return db.select().from(watchlist).where(eq(watchlist.mint, item.mint)).get()!;
}

export function getWatchlist(enabledOnly = false): WatchlistItem[] {
  const db = getDb();
  return enabledOnly
    ? db.select().from(watchlist).where(eq(watchlist.enabled, true)).all()
    : db.select().from(watchlist).all();
}

export function removeWatchlistItem(mint: string): void {
  getDb().delete(watchlist).where(eq(watchlist.mint, mint)).run();
}

export function setWatchlistReference(mint: string, priceUsd: number, triggered = false): void {
  getDb()
    .update(watchlist)
    .set({
      referencePriceUsd: priceUsd,
      referenceSetAt: new Date(),
      ...(triggered ? { lastTriggeredAt: new Date() } : {}),
    })
    .where(eq(watchlist.mint, mint))
    .run();
}

// ---------------------------------------------------------------------------
// Price snapshots
// ---------------------------------------------------------------------------

export function recordPriceSnapshot(mint: string, priceUsd: number): void {
  getDb().insert(priceSnapshots).values({ mint, priceUsd, at: new Date() }).run();
}

export function getPriceHistory(mint: string, sinceMs: number): { priceUsd: number; at: Date }[] {
  return getDb()
    .select({ priceUsd: priceSnapshots.priceUsd, at: priceSnapshots.at })
    .from(priceSnapshots)
    .where(and(eq(priceSnapshots.mint, mint), sql`${priceSnapshots.at} >= ${sinceMs}`))
    .orderBy(priceSnapshots.at)
    .all();
}

/** Keep the snapshots table small — called periodically by the engine. */
export function prunePriceSnapshots(olderThanMs: number): void {
  getDb()
    .delete(priceSnapshots)
    .where(lt(priceSnapshots.at, new Date(Date.now() - olderThanMs)))
    .run();
}

// ---------------------------------------------------------------------------
// KV store: paper balance & daily loss tracking
// ---------------------------------------------------------------------------

export function kvGet(key: string): string | undefined {
  return getDb().select().from(kvStore).where(eq(kvStore.key, key)).get()?.value;
}

export function kvSet(key: string, value: string): void {
  const db = getDb();
  db.insert(kvStore)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: kvStore.key, set: { value, updatedAt: new Date() } })
    .run();
}

const PAPER_BALANCE_KEY = "paper_balance_lamports";

export function getPaperBalanceLamports(): bigint {
  const stored = kvGet(PAPER_BALANCE_KEY);
  if (stored !== undefined) return BigInt(stored);
  const initial = solToLamports(loadConfig().PAPER_STARTING_BALANCE_SOL);
  kvSet(PAPER_BALANCE_KEY, initial.toString());
  return initial;
}

export function adjustPaperBalance(deltaLamports: bigint): bigint {
  const next = getPaperBalanceLamports() + deltaLamports;
  if (next < 0n) throw new Error("insufficient paper balance");
  kvSet(PAPER_BALANCE_KEY, next.toString());
  return next;
}

export function resetPaperBalance(): bigint {
  const initial = solToLamports(loadConfig().PAPER_STARTING_BALANCE_SOL);
  kvSet(PAPER_BALANCE_KEY, initial.toString());
  return initial;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getDailyRealizedLossSol(): number {
  const raw = kvGet("daily_loss");
  if (!raw) return 0;
  const { date, loss } = JSON.parse(raw) as { date: string; loss: number };
  return date === todayKey() ? loss : 0;
}

export function addDailyRealizedLoss(lossSol: number): void {
  const current = getDailyRealizedLossSol();
  kvSet("daily_loss", JSON.stringify({ date: todayKey(), loss: current + lossSol }));
}
