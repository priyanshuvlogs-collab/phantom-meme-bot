import { TradeExecutor } from "@phantom-meme-bot/core";
import { handleApi } from "@/lib/apiError";

export const dynamic = "force-dynamic";

/**
 * Server-side trade execution (paper mode, or live via the configured burner
 * keypair). The interactive Phantom flow uses /api/jupiter/* + client-side
 * signing instead so keys never touch the server.
 */
export async function POST(request: Request) {
  return handleApi(async () => {
    const body = (await request.json()) as
      | {
          action: "buy";
          mint: string;
          solAmount: number;
          takeProfitPct?: number;
          stopLossPct?: number;
          skipSafety?: boolean;
        }
      | { action: "sell"; positionIdOrMint: string; portionPct?: number };

    const executor = new TradeExecutor();
    if (body.action === "buy") {
      const result = await executor.buy({
        mint: body.mint,
        solAmount: body.solAmount,
        takeProfitPct: body.takeProfitPct,
        stopLossPct: body.stopLossPct,
        skipSafety: body.skipSafety,
      });
      return { trade: result.trade, position: result.position, txSignature: result.txSignature };
    }
    const result = await executor.sell({
      positionIdOrMint: body.positionIdOrMint,
      portionPct: body.portionPct,
    });
    return { trade: result.trade, position: result.position, txSignature: result.txSignature };
  });
}
