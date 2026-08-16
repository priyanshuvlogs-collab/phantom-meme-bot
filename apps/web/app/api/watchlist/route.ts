import {
  getMintDecimals,
  getTokenMarketInfo,
  getWatchlist,
  removeWatchlistItem,
  upsertWatchlistItem,
} from "@phantom-meme-bot/core";
import { NextResponse } from "next/server";
import { handleApi } from "@/lib/apiError";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleApi(() => getWatchlist());
}

export async function POST(request: Request) {
  return handleApi(async () => {
    const body = (await request.json()) as {
      mint: string;
      dipBuyPct?: number | null;
      dipBuySizeSol?: number | null;
      riseSellPct?: number | null;
      riseSellPortionPct?: number | null;
      cooldownMinutes?: number;
      enabled?: boolean;
    };
    if (!body.mint) throw new Error("mint is required");
    if (body.dipBuyPct != null && !body.dipBuySizeSol) {
      throw new Error("dipBuySizeSol is required when dipBuyPct is set");
    }
    const [decimals, market] = await Promise.all([
      getMintDecimals(body.mint),
      getTokenMarketInfo(body.mint).catch(() => undefined),
    ]);
    return upsertWatchlistItem({
      mint: body.mint,
      symbol: market?.symbol ?? "?",
      decimals,
      enabled: body.enabled ?? true,
      dipBuyPct: body.dipBuyPct ?? null,
      dipBuySizeSol: body.dipBuySizeSol ?? null,
      riseSellPct: body.riseSellPct ?? null,
      riseSellPortionPct: body.riseSellPortionPct ?? 100,
      cooldownMs: (body.cooldownMinutes ?? 5) * 60_000,
    });
  });
}

export async function DELETE(request: Request) {
  const mint = new URL(request.url).searchParams.get("mint");
  if (!mint) return NextResponse.json({ error: "mint is required" }, { status: 400 });
  return handleApi(() => {
    removeWatchlistItem(mint);
    return { ok: true };
  });
}
