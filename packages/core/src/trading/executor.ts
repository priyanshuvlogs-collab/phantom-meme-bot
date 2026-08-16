import { loadConfig } from "../config.js";
import { SOL_MINT, lamportsToSol, solToLamports } from "../constants.js";
import {
  addDailyRealizedLoss,
  adjustPaperBalance,
  getDailyRealizedLossSol,
  getOpenPositionByMint,
  getOpenPositions,
  getPosition,
  increasePosition,
  openPosition,
  recordTrade,
  reducePosition,
} from "../db/repo.js";
import type { Position, Trade } from "../db/schema.js";
import { getTokenMarketInfo } from "../dexscreener.js";
import { getJupiterClient } from "../jupiter/client.js";
import { getLogger } from "../logger.js";
import { checkTokenSafety, getMintDecimals } from "../safety/checkToken.js";
import type { SafetyReport } from "../safety/types.js";
import { getConnection } from "../solana.js";
import { loadSigner } from "../wallet/signer.js";

const log = getLogger("executor");

export type TradeReason = "manual" | "take_profit" | "stop_loss" | "dip_buy" | "rise_sell";

export interface BuyParams {
  mint: string;
  solAmount: number;
  reason?: TradeReason;
  takeProfitPct?: number | null;
  stopLossPct?: number | null;
  /** Skip the pre-buy safety screen (NOT recommended). */
  skipSafety?: boolean;
  slippageBps?: number;
}

export interface SellParams {
  /** Position id, or a mint address of an open position in the current mode. */
  positionIdOrMint: string;
  /** Percentage of the held amount to sell, 1–100. */
  portionPct?: number;
  reason?: TradeReason;
  slippageBps?: number;
}

export interface TradeResult {
  trade: Trade;
  position: Position;
  txSignature?: string;
}

export class RiskLimitError extends Error {
  override name = "RiskLimitError";
}

export class SafetyError extends Error {
  override name = "SafetyError";
  constructor(public readonly report: SafetyReport) {
    super(
      `Safety check failed for ${report.mint}: ` +
        report.checks
          .filter((c) => !c.passed)
          .map((c) => `${c.label} (${c.value})`)
          .join("; "),
    );
  }
}

/**
 * Executes buys and sells through Jupiter.
 *
 * - `paper` mode (default): fills are simulated using REAL Jupiter quotes, so
 *   price impact and routing are realistic, but no transaction is sent and no
 *   wallet is required. A virtual SOL balance is tracked in the database.
 * - `live` mode: builds the swap via Jupiter, signs with the configured
 *   burner-wallet keypair and sends it. Requires LIVE_TRADING_ACKNOWLEDGED.
 *
 * Global risk caps (max position size, max open positions, daily loss halt)
 * are enforced here so every caller — CLI, strategies, dashboard — gets the
 * same protection.
 */
export class TradeExecutor {
  private readonly config = loadConfig();
  private readonly jupiter = getJupiterClient();

  get mode(): "paper" | "live" {
    return this.config.TRADING_MODE;
  }

  async buy(params: BuyParams): Promise<TradeResult> {
    const { mint, solAmount } = params;
    const reason = params.reason ?? "manual";
    this.assertRiskLimits(mint, solAmount);

    if (!params.skipSafety) {
      const report = await checkTokenSafety(mint);
      if (!report.passed) throw new SafetyError(report);
    }

    const [decimals, market, tokenPriceUsd] = await Promise.all([
      getMintDecimals(mint),
      getTokenMarketInfo(mint).catch(() => undefined),
      this.jupiter.getUsdPrice(mint),
    ]);
    const symbol = market?.symbol ?? "?";

    const lamportsIn = solToLamports(solAmount);
    const quote = await this.jupiter.getQuote({
      inputMint: SOL_MINT,
      outputMint: mint,
      amountRaw: lamportsIn,
      slippageBps: params.slippageBps,
    });
    const tokensOut = BigInt(quote.outAmount);
    if (tokensOut <= 0n) throw new Error("quote returned zero output amount");

    // Effective fill price implied by the quote (falls back to price API).
    const effectivePriceUsd = await this.impliedFillPriceUsd(
      lamportsIn,
      tokensOut,
      decimals,
      tokenPriceUsd,
    );

    let txSignature: string | undefined;
    let status: Trade["status"];
    if (this.config.isPaper) {
      adjustPaperBalance(-lamportsIn);
      status = "simulated";
      log.info(
        { mint, symbol, solAmount, tokensOut: tokensOut.toString(), reason },
        "PAPER buy filled",
      );
    } else {
      const signer = loadSigner();
      const swap = await this.jupiter.buildSwapTransaction(quote, signer.publicKey.toBase58());
      try {
        txSignature = await this.jupiter.executeSwap(getConnection(), swap, signer);
      } catch (err) {
        recordTrade({
          positionId: null,
          mint,
          symbol,
          side: "buy",
          mode: "live",
          status: "failed",
          reason,
          inputMint: SOL_MINT,
          outputMint: mint,
          inAmountRaw: lamportsIn.toString(),
          outAmountRaw: "0",
          priceUsd: effectivePriceUsd,
          txSignature: null,
          error: String(err),
        });
        throw err;
      }
      status = "confirmed";
      log.info({ mint, symbol, solAmount, txSignature, reason }, "LIVE buy confirmed");
    }

    // Position bookkeeping: average into an existing open position, else open.
    const existing = getOpenPositionByMint(mint, this.mode);
    let position: Position;
    if (existing) {
      increasePosition(existing.id, tokensOut, lamportsIn, effectivePriceUsd);
      position = getPosition(existing.id)!;
    } else {
      position = openPosition({
        mint,
        symbol,
        decimals,
        mode: this.mode,
        tokenAmountRaw: tokensOut,
        solSpentLamports: lamportsIn,
        entryPriceUsd: effectivePriceUsd,
        takeProfitPct: params.takeProfitPct ?? this.config.DEFAULT_TAKE_PROFIT_PCT,
        stopLossPct: params.stopLossPct ?? this.config.DEFAULT_STOP_LOSS_PCT,
      });
    }

    const trade = recordTrade({
      positionId: position.id,
      mint,
      symbol,
      side: "buy",
      mode: this.mode,
      status,
      reason,
      inputMint: SOL_MINT,
      outputMint: mint,
      inAmountRaw: lamportsIn.toString(),
      outAmountRaw: tokensOut.toString(),
      priceUsd: effectivePriceUsd,
      txSignature: txSignature ?? null,
      error: null,
    });

    return { trade, position, txSignature };
  }

  async sell(params: SellParams): Promise<TradeResult> {
    const reason = params.reason ?? "manual";
    const portionPct = params.portionPct ?? 100;
    if (portionPct <= 0 || portionPct > 100) {
      throw new Error(`portionPct must be in (0, 100], got ${portionPct}`);
    }

    const position =
      getPosition(params.positionIdOrMint) ??
      getOpenPositionByMint(params.positionIdOrMint, this.mode);
    if (!position) throw new Error(`no position found for "${params.positionIdOrMint}"`);
    if (position.status !== "open") throw new Error(`position ${position.id} is already closed`);
    if (position.mode !== this.mode) {
      throw new Error(
        `position ${position.id} is a ${position.mode} position but the bot is in ${this.mode} mode`,
      );
    }

    const held = BigInt(position.tokenAmountRaw);
    const tokensToSell = portionPct === 100 ? held : (held * BigInt(Math.round(portionPct * 100))) / 10_000n;
    if (tokensToSell <= 0n) throw new Error("nothing to sell");

    const quote = await this.jupiter.getQuote({
      inputMint: position.mint,
      outputMint: SOL_MINT,
      amountRaw: tokensToSell,
      slippageBps: params.slippageBps,
    });
    const lamportsOut = BigInt(quote.outAmount);
    const tokenPriceUsd = await this.jupiter.getUsdPrice(position.mint);

    let txSignature: string | undefined;
    let status: Trade["status"];
    if (this.config.isPaper) {
      adjustPaperBalance(lamportsOut);
      status = "simulated";
      log.info(
        {
          mint: position.mint,
          symbol: position.symbol,
          portionPct,
          solOut: lamportsToSol(lamportsOut),
          reason,
        },
        "PAPER sell filled",
      );
    } else {
      const signer = loadSigner();
      const swap = await this.jupiter.buildSwapTransaction(quote, signer.publicKey.toBase58());
      try {
        txSignature = await this.jupiter.executeSwap(getConnection(), swap, signer);
      } catch (err) {
        recordTrade({
          positionId: position.id,
          mint: position.mint,
          symbol: position.symbol,
          side: "sell",
          mode: "live",
          status: "failed",
          reason,
          inputMint: position.mint,
          outputMint: SOL_MINT,
          inAmountRaw: tokensToSell.toString(),
          outAmountRaw: "0",
          priceUsd: tokenPriceUsd ?? null,
          txSignature: null,
          error: String(err),
        });
        throw err;
      }
      status = "confirmed";
      log.info(
        { mint: position.mint, symbol: position.symbol, portionPct, txSignature, reason },
        "LIVE sell confirmed",
      );
    }

    const updated = reducePosition(position.id, tokensToSell, lamportsOut);
    const trade = recordTrade({
      positionId: position.id,
      mint: position.mint,
      symbol: position.symbol,
      side: "sell",
      mode: this.mode,
      status,
      reason,
      inputMint: position.mint,
      outputMint: SOL_MINT,
      inAmountRaw: tokensToSell.toString(),
      outAmountRaw: lamportsOut.toString(),
      priceUsd: tokenPriceUsd ?? null,
      txSignature: txSignature ?? null,
      error: null,
    });

    return { trade, position: updated, txSignature };
  }

  /** Throws RiskLimitError when a buy would breach a configured cap. */
  private assertRiskLimits(mint: string, solAmount: number): void {
    if (solAmount <= 0) throw new RiskLimitError("buy amount must be positive");
    if (solAmount > this.config.MAX_POSITION_SIZE_SOL) {
      throw new RiskLimitError(
        `buy of ${solAmount} SOL exceeds MAX_POSITION_SIZE_SOL=${this.config.MAX_POSITION_SIZE_SOL}`,
      );
    }

    const dailyLoss = getDailyRealizedLossSol();
    if (dailyLoss >= this.config.MAX_DAILY_LOSS_SOL) {
      throw new RiskLimitError(
        `daily realized loss ${dailyLoss.toFixed(4)} SOL has hit MAX_DAILY_LOSS_SOL=${this.config.MAX_DAILY_LOSS_SOL}; new buys are halted until tomorrow`,
      );
    }

    const open = getOpenPositions(this.mode);
    const alreadyHolding = open.some((p) => p.mint === mint);
    if (!alreadyHolding && open.length >= this.config.MAX_OPEN_POSITIONS) {
      throw new RiskLimitError(
        `already at MAX_OPEN_POSITIONS=${this.config.MAX_OPEN_POSITIONS} open positions`,
      );
    }
  }

  /**
   * USD price implied by the quote's actual in/out amounts (captures price
   * impact), using the SOL/USD price for conversion. Falls back to the
   * price-API value when SOL price is unavailable.
   */
  private async impliedFillPriceUsd(
    lamportsIn: bigint,
    tokensOutRaw: bigint,
    tokenDecimals: number,
    fallbackPriceUsd: number | undefined,
  ): Promise<number> {
    const solPriceUsd = await this.jupiter.getUsdPrice(SOL_MINT);
    if (solPriceUsd !== undefined && tokensOutRaw > 0n) {
      const solIn = lamportsToSol(lamportsIn);
      const tokensUi = Number(tokensOutRaw) / 10 ** tokenDecimals;
      return (solIn * solPriceUsd) / tokensUi;
    }
    if (fallbackPriceUsd !== undefined) return fallbackPriceUsd;
    throw new Error("could not determine fill price in USD");
  }
}

// Re-export so strategy code can raise daily-loss without deep imports.
export { addDailyRealizedLoss };
