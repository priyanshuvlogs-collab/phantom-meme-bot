import {
  SOL_MINT,
  getMintDecimals,
  getOpenPositionByMint,
  getPosition,
  getTokenMarketInfo,
  getJupiterClient,
  increasePosition,
  lamportsToSol,
  loadConfig,
  openPosition,
  recordTrade,
  reducePosition,
} from "@phantom-meme-bot/core";
import { handleApi } from "@/lib/apiError";

export const dynamic = "force-dynamic";

/**
 * Records a swap that was signed and sent by the user's own Phantom wallet,
 * so wallet-signed trades show up in positions/PnL alongside bot trades.
 * Amounts come from the quote the user accepted (documented approximation —
 * the on-chain fill can differ within slippage bounds).
 */
export async function POST(request: Request) {
  return handleApi(async () => {
    const body = (await request.json()) as {
      side: "buy" | "sell";
      mint: string;
      inAmountRaw: string;
      outAmountRaw: string;
      txSignature: string;
    };
    if (!body.mint || !body.txSignature) throw new Error("mint and txSignature are required");

    const config = loadConfig();
    const [decimals, market, priceUsd] = await Promise.all([
      getMintDecimals(body.mint),
      getTokenMarketInfo(body.mint).catch(() => undefined),
      getJupiterClient()
        .getUsdPrice(body.mint)
        .catch(() => undefined),
    ]);
    const symbol = market?.symbol ?? "?";
    // Wallet-signed swaps are real on-chain trades regardless of bot mode.
    const mode = "live" as const;

    let positionId: string | null = null;
    if (body.side === "buy") {
      const tokensOut = BigInt(body.outAmountRaw);
      const lamportsIn = BigInt(body.inAmountRaw);
      const solPrice = await getJupiterClient()
        .getUsdPrice(SOL_MINT)
        .catch(() => undefined);
      const fillPriceUsd =
        solPrice !== undefined && tokensOut > 0n
          ? (lamportsToSol(lamportsIn) * solPrice) / (Number(tokensOut) / 10 ** decimals)
          : (priceUsd ?? 0);

      const existing = getOpenPositionByMint(body.mint, mode);
      if (existing) {
        increasePosition(existing.id, tokensOut, lamportsIn, fillPriceUsd);
        positionId = existing.id;
      } else {
        positionId = openPosition({
          mint: body.mint,
          symbol,
          decimals,
          mode,
          tokenAmountRaw: tokensOut,
          solSpentLamports: lamportsIn,
          entryPriceUsd: fillPriceUsd,
          takeProfitPct: config.DEFAULT_TAKE_PROFIT_PCT,
          stopLossPct: config.DEFAULT_STOP_LOSS_PCT,
        }).id;
      }
    } else {
      const existing = getOpenPositionByMint(body.mint, mode);
      if (existing) {
        reducePosition(existing.id, BigInt(body.inAmountRaw), BigInt(body.outAmountRaw));
        positionId = existing.id;
      }
    }

    const trade = recordTrade({
      positionId,
      mint: body.mint,
      symbol,
      side: body.side,
      mode,
      status: "confirmed",
      reason: "manual",
      inputMint: body.side === "buy" ? SOL_MINT : body.mint,
      outputMint: body.side === "buy" ? body.mint : SOL_MINT,
      inAmountRaw: body.inAmountRaw,
      outAmountRaw: body.outAmountRaw,
      priceUsd: priceUsd ?? null,
      txSignature: body.txSignature,
      error: null,
    });
    return { trade, position: positionId ? getPosition(positionId) : null };
  });
}
