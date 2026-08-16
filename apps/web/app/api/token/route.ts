import { getMintDecimals, getTokenMarketInfo } from "@phantom-meme-bot/core";
import { NextResponse } from "next/server";
import { handleApi } from "@/lib/apiError";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const mint = new URL(request.url).searchParams.get("mint");
  if (!mint) return NextResponse.json({ error: "mint is required" }, { status: 400 });
  return handleApi(async () => {
    const [decimals, market] = await Promise.all([
      getMintDecimals(mint),
      getTokenMarketInfo(mint).catch(() => undefined),
    ]);
    return { mint, decimals, symbol: market?.symbol ?? "?", name: market?.name ?? "Unknown" };
  });
}
