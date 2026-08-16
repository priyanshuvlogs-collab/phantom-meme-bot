import { describe, expect, it } from "vitest";
import type { Position, WatchlistItem } from "@phantom-meme-bot/core";
import { evaluateExit } from "./takeProfitStopLoss.js";
import { shouldDipBuy } from "./dipBuy.js";
import { shouldRiseSell } from "./riseSell.js";

function makePosition(overrides: Partial<Position> = {}): Position {
  return {
    id: "p1",
    mint: "mint1",
    symbol: "TEST",
    decimals: 6,
    mode: "paper",
    status: "open",
    tokenAmountRaw: "1000000",
    solSpentLamports: "1000000000",
    solReceivedLamports: "0",
    entryPriceUsd: 1.0,
    highWaterPriceUsd: 1.0,
    takeProfitPct: 50,
    stopLossPct: 20,
    realizedPnlSol: 0,
    openedAt: new Date(),
    closedAt: null,
    ...overrides,
  };
}

function makeWatchlistItem(overrides: Partial<WatchlistItem> = {}): WatchlistItem {
  return {
    mint: "mint1",
    symbol: "TEST",
    decimals: 6,
    enabled: true,
    referencePriceUsd: 1.0,
    referenceSetAt: new Date(),
    dipBuyPct: 10,
    dipBuySizeSol: 0.05,
    riseSellPct: 25,
    riseSellPortionPct: 50,
    cooldownMs: 300_000,
    lastTriggeredAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe("evaluateExit (TP/SL)", () => {
  it("triggers take profit at or above the threshold", () => {
    expect(evaluateExit(makePosition(), 1.5)).toBe("take_profit");
    expect(evaluateExit(makePosition(), 2.0)).toBe("take_profit");
  });

  it("triggers stop loss at or below the threshold", () => {
    expect(evaluateExit(makePosition(), 0.8)).toBe("stop_loss");
    expect(evaluateExit(makePosition(), 0.5)).toBe("stop_loss");
  });

  it("holds inside the band", () => {
    expect(evaluateExit(makePosition(), 1.49)).toBeNull();
    expect(evaluateExit(makePosition(), 0.81)).toBeNull();
    expect(evaluateExit(makePosition(), 1.0)).toBeNull();
  });

  it("ignores disabled thresholds", () => {
    expect(evaluateExit(makePosition({ takeProfitPct: null }), 10)).toBeNull();
    expect(evaluateExit(makePosition({ stopLossPct: null }), 0.01)).toBeNull();
  });
});

describe("shouldDipBuy", () => {
  const now = Date.now();

  it("buys when the drop meets the threshold", () => {
    expect(shouldDipBuy(makeWatchlistItem(), 0.9, now)).toBe(true);
    expect(shouldDipBuy(makeWatchlistItem(), 0.85, now)).toBe(true);
  });

  it("does not buy above the threshold", () => {
    expect(shouldDipBuy(makeWatchlistItem(), 0.91, now)).toBe(false);
    expect(shouldDipBuy(makeWatchlistItem(), 1.1, now)).toBe(false);
  });

  it("respects cooldown and disabled flags", () => {
    expect(
      shouldDipBuy(makeWatchlistItem({ lastTriggeredAt: new Date(now - 60_000) }), 0.5, now),
    ).toBe(false);
    expect(shouldDipBuy(makeWatchlistItem({ enabled: false }), 0.5, now)).toBe(false);
    expect(shouldDipBuy(makeWatchlistItem({ dipBuyPct: null }), 0.5, now)).toBe(false);
    expect(shouldDipBuy(makeWatchlistItem({ referencePriceUsd: null }), 0.5, now)).toBe(false);
  });
});

describe("shouldRiseSell", () => {
  const now = Date.now();

  it("sells when the rise meets the threshold", () => {
    expect(shouldRiseSell(makeWatchlistItem(), 1.25, now)).toBe(true);
    expect(shouldRiseSell(makeWatchlistItem(), 2.0, now)).toBe(true);
  });

  it("does not sell below the threshold", () => {
    expect(shouldRiseSell(makeWatchlistItem(), 1.24, now)).toBe(false);
    expect(shouldRiseSell(makeWatchlistItem(), 0.9, now)).toBe(false);
  });

  it("respects cooldown", () => {
    expect(
      shouldRiseSell(makeWatchlistItem({ lastTriggeredAt: new Date(now - 1000) }), 2.0, now),
    ).toBe(false);
  });
});
