import {
  Connection,
  VersionedTransaction,
  type Keypair,
} from "@solana/web3.js";
import { loadConfig } from "../config.js";
import { getLogger } from "../logger.js";
import { RateLimiter, fetchJson } from "../rateLimiter.js";
import type { PriceResponse, QuoteResponse, SwapResponse } from "./types.js";

const log = getLogger("jupiter");

/**
 * Client for the Jupiter Aggregator APIs (quote, swap, price).
 *
 * Jupiter routes across Raydium, Orca, Meteora, Pump.fun and dozens of other
 * Solana venues, so a single integration covers effectively all meme coin
 * liquidity. The free `lite-api.jup.ag` tier works without a key; setting
 * JUPITER_API_KEY switches to the higher-limit `api.jup.ag` host.
 */
export class JupiterClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  // Lite tier allows ~60 req/min per bucket; stay comfortably below it.
  private readonly limiter = new RateLimiter(5, 0.8);

  constructor(baseUrl?: string, apiKey?: string) {
    const config = loadConfig();
    this.baseUrl = (baseUrl ?? config.JUPITER_API_BASE_URL).replace(/\/$/, "");
    const key = apiKey ?? config.JUPITER_API_KEY;
    this.headers = {
      "content-type": "application/json",
      ...(key ? { "x-api-key": key } : {}),
    };
  }

  /** Get the best route for swapping `amountRaw` of inputMint into outputMint. */
  async getQuote(params: {
    inputMint: string;
    outputMint: string;
    amountRaw: bigint;
    slippageBps?: number;
  }): Promise<QuoteResponse> {
    const config = loadConfig();
    const search = new URLSearchParams({
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      amount: params.amountRaw.toString(),
      slippageBps: String(params.slippageBps ?? config.SLIPPAGE_BPS),
      swapMode: "ExactIn",
    });
    const url = `${this.baseUrl}/swap/v1/quote?${search}`;
    const quote = await fetchJson<QuoteResponse>(url, {
      headers: this.headers,
      limiter: this.limiter,
    });
    log.debug(
      {
        inputMint: params.inputMint,
        outputMint: params.outputMint,
        inAmount: quote.inAmount,
        outAmount: quote.outAmount,
        priceImpactPct: quote.priceImpactPct,
      },
      "quote",
    );
    return quote;
  }

  /** Build an unsigned swap transaction for a previously fetched quote. */
  async buildSwapTransaction(
    quote: QuoteResponse,
    userPublicKey: string,
  ): Promise<SwapResponse> {
    const config = loadConfig();
    const body = {
      quoteResponse: quote,
      userPublicKey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      ...(config.PRIORITY_FEE_LAMPORTS === "auto"
        ? { dynamicSlippage: false, prioritizationFeeLamports: { priorityLevelWithMaxLamports: { priorityLevel: "high", maxLamports: 5_000_000 } } }
        : { prioritizationFeeLamports: config.PRIORITY_FEE_LAMPORTS }),
    };
    return fetchJson<SwapResponse>(`${this.baseUrl}/swap/v1/swap`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
      limiter: this.limiter,
    });
  }

  /** Sign, send and confirm a swap transaction. Live mode only. */
  async executeSwap(
    connection: Connection,
    swap: SwapResponse,
    signer: Keypair,
  ): Promise<string> {
    const tx = VersionedTransaction.deserialize(Buffer.from(swap.swapTransaction, "base64"));
    tx.sign([signer]);

    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
    log.info({ signature }, "swap sent, awaiting confirmation");

    const latest = await connection.getLatestBlockhash();
    const confirmation = await connection.confirmTransaction(
      {
        signature,
        blockhash: latest.blockhash,
        lastValidBlockHeight: swap.lastValidBlockHeight ?? latest.lastValidBlockHeight,
      },
      "confirmed",
    );
    if (confirmation.value.err) {
      throw new Error(`swap ${signature} failed on-chain: ${JSON.stringify(confirmation.value.err)}`);
    }
    return signature;
  }

  /** USD prices for up to 50 mints per call (Jupiter Price API v3). */
  async getUsdPrices(mints: string[]): Promise<Map<string, number>> {
    const prices = new Map<string, number>();
    for (let i = 0; i < mints.length; i += 50) {
      const batch = mints.slice(i, i + 50);
      const url = `${this.baseUrl}/price/v3?ids=${batch.join(",")}`;
      const res = await fetchJson<PriceResponse>(url, {
        headers: this.headers,
        limiter: this.limiter,
      });
      for (const mint of batch) {
        const entry = res[mint];
        if (entry?.usdPrice !== undefined) prices.set(mint, entry.usdPrice);
      }
    }
    return prices;
  }

  async getUsdPrice(mint: string): Promise<number | undefined> {
    return (await this.getUsdPrices([mint])).get(mint);
  }
}

let shared: JupiterClient | undefined;

export function getJupiterClient(): JupiterClient {
  if (!shared) shared = new JupiterClient();
  return shared;
}
