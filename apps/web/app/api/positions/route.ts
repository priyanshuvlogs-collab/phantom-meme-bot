import {
  computePositionPnl,
  getAllPositions,
  getJupiterClient,
  getOpenPositions,
} from "@phantom-meme-bot/core";
import { handleApi } from "@/lib/apiError";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleApi(async () => {
    const all = new URL(request.url).searchParams.get("all") === "true";
    const positions = all ? getAllPositions() : getOpenPositions();

    const openMints = [...new Set(positions.filter((p) => p.status === "open").map((p) => p.mint))];
    const prices =
      openMints.length > 0
        ? await getJupiterClient()
            .getUsdPrices(openMints)
            .catch(() => new Map<string, number>())
        : new Map<string, number>();

    return positions.map((position) => ({
      ...position,
      pnl: computePositionPnl(position, prices.get(position.mint)),
    }));
  });
}
