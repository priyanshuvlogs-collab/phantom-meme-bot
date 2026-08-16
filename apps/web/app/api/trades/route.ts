import { getRecentTrades } from "@phantom-meme-bot/core";
import { handleApi } from "@/lib/apiError";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleApi(() => {
    const limit = Number(new URL(request.url).searchParams.get("limit") ?? 50);
    return getRecentTrades(Math.min(limit, 200));
  });
}
