import { getJupiterClient, type QuoteResponse } from "@phantom-meme-bot/core";
import { handleApi } from "@/lib/apiError";

export const dynamic = "force-dynamic";

/**
 * Builds an UNSIGNED swap transaction for the connected Phantom wallet.
 * Signing happens in the browser — the server never sees a private key.
 */
export async function POST(request: Request) {
  return handleApi(async () => {
    const body = (await request.json()) as {
      quoteResponse: QuoteResponse;
      userPublicKey: string;
    };
    if (!body.quoteResponse || !body.userPublicKey) {
      throw new Error("quoteResponse and userPublicKey are required");
    }
    return getJupiterClient().buildSwapTransaction(body.quoteResponse, body.userPublicKey);
  });
}
