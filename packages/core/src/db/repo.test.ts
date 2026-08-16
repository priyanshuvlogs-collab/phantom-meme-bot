import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pmb-test-"));
  process.env.DATABASE_PATH = path.join(tmpDir, "test.db");
  process.env.TRADING_MODE = "paper";
  process.env.PAPER_STARTING_BALANCE_SOL = "10";
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("position lifecycle", () => {
  it("opens, partially sells, and closes a position with correct PnL", async () => {
    const { openPosition, reducePosition, getPosition } = await import("./repo.js");

    // Buy 1,000,000 tokens (6 decimals) for 1 SOL at $0.0001.
    const pos = openPosition({
      mint: "TestMint111111111111111111111111111111111111",
      symbol: "TEST",
      decimals: 6,
      mode: "paper",
      tokenAmountRaw: 1_000_000_000_000n,
      solSpentLamports: 1_000_000_000n,
      entryPriceUsd: 0.0001,
      takeProfitPct: 50,
      stopLossPct: 20,
    });
    expect(pos.status).toBe("open");

    // Sell half for 0.75 SOL → realized +0.25 SOL on a 0.5 SOL cost basis.
    const afterHalf = reducePosition(pos.id, 500_000_000_000n, 750_000_000n);
    expect(afterHalf.status).toBe("open");
    expect(afterHalf.tokenAmountRaw).toBe("500000000000");
    expect(afterHalf.solSpentLamports).toBe("500000000");
    expect(afterHalf.realizedPnlSol).toBeCloseTo(0.25, 9);

    // Sell the rest for 0.4 SOL → realized -0.1 SOL, position closes.
    const closed = reducePosition(pos.id, 500_000_000_000n, 400_000_000n);
    expect(closed.status).toBe("closed");
    expect(closed.tokenAmountRaw).toBe("0");
    expect(closed.realizedPnlSol).toBeCloseTo(0.15, 9);
    expect(getPosition(pos.id)?.closedAt).toBeTruthy();
  });

  it("tracks paper balance and daily loss", async () => {
    const { getPaperBalanceLamports, adjustPaperBalance, getDailyRealizedLossSol } = await import(
      "./repo.js"
    );
    const start = getPaperBalanceLamports();
    adjustPaperBalance(-1_000_000_000n);
    expect(getPaperBalanceLamports()).toBe(start - 1_000_000_000n);
    adjustPaperBalance(1_000_000_000n);
    expect(getPaperBalanceLamports()).toBe(start);
    // The losing sell in the previous test registered a 0.1 SOL daily loss.
    expect(getDailyRealizedLossSol()).toBeCloseTo(0.1, 9);
    expect(() => adjustPaperBalance(-start - 1n)).toThrow(/insufficient/);
  });
});

describe("pnl", () => {
  it("computes unrealized PnL from current price", async () => {
    const { computePositionPnl } = await import("../trading/pnl.js");
    const pnl = computePositionPnl(
      {
        id: "x",
        mint: "m",
        symbol: "TEST",
        decimals: 6,
        mode: "paper",
        status: "open",
        tokenAmountRaw: "1000000000000", // 1,000,000 tokens
        solSpentLamports: "1000000000",
        solReceivedLamports: "0",
        entryPriceUsd: 0.0001,
        highWaterPriceUsd: 0.0001,
        takeProfitPct: 50,
        stopLossPct: 20,
        realizedPnlSol: 0,
        openedAt: new Date(),
        closedAt: null,
      },
      0.00015,
    );
    expect(pnl.tokenAmountUi).toBe(1_000_000);
    expect(pnl.unrealizedPnlPct).toBeCloseTo(50, 6);
    expect(pnl.unrealizedPnlUsd).toBeCloseTo(50, 6);
  });
});
