import { getJupiterClient } from "@phantom-meme-bot/core";
import { NextResponse } from "next/server";
import { handleApi } from "@/lib/apiError";

export const dynamic = "force-dynamic";

/** Proxied Jupiter quote so the browser shares the server's rate limiter/key. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const inputMint = params.get("inputMint");
  const outputMint = params.get("outputMint");
  const amountRaw = params.get("amountRaw");
  if (!inputMint || !outputMint || !amountRaw) {
    return NextResponse.json(
      { error: "inputMint, outputMint and amountRaw are required" },
      { status: 400 },
    );
  }
  return handleApi(() =>
    getJupiterClient().getQuote({
      inputMint,
      outputMint,
      amountRaw: BigInt(amountRaw),
      slippageBps: params.get("slippageBps") ? Number(params.get("slippageBps")) : undefined,
    }),
  );
}
