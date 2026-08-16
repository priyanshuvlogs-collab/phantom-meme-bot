import {
  SOL_MINT,
  getDailyRealizedLossSol,
  getJupiterClient,
  getOpenPositions,
  getPaperBalanceLamports,
  kvGet,
  lamportsToSol,
  loadConfig,
} from "@phantom-meme-bot/core";
import { handleApi } from "@/lib/apiError";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleApi(async () => {
    const config = loadConfig();
    const solPriceUsd = await getJupiterClient()
      .getUsdPrice(SOL_MINT)
      .catch(() => undefined);
    const lastTick = kvGet("engine_last_tick");
    return {
      mode: config.TRADING_MODE,
      paperBalanceSol: config.isPaper ? lamportsToSol(getPaperBalanceLamports()) : null,
      dailyRealizedLossSol: getDailyRealizedLossSol(),
      openPositions: getOpenPositions(config.TRADING_MODE).length,
      limits: {
        maxPositionSizeSol: config.MAX_POSITION_SIZE_SOL,
        maxOpenPositions: config.MAX_OPEN_POSITIONS,
        maxDailyLossSol: config.MAX_DAILY_LOSS_SOL,
        defaultTakeProfitPct: config.DEFAULT_TAKE_PROFIT_PCT,
        defaultStopLossPct: config.DEFAULT_STOP_LOSS_PCT,
        slippageBps: config.SLIPPAGE_BPS,
      },
      solPriceUsd: solPriceUsd ?? null,
      engineLastTickAt: lastTick ? Number(lastTick) : null,
    };
  });
}
