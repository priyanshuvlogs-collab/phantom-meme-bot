/** Subset of Jupiter Swap API v1 types the bot relies on. */

export interface QuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: "ExactIn" | "ExactOut";
  slippageBps: number;
  priceImpactPct: string;
  routePlan: RoutePlanStep[];
  contextSlot?: number;
  timeTaken?: number;
}

export interface RoutePlanStep {
  swapInfo: {
    ammKey: string;
    label?: string;
    inputMint: string;
    outputMint: string;
    inAmount: string;
    outAmount: string;
    feeAmount: string;
    feeMint: string;
  };
  percent: number;
}

export interface SwapResponse {
  swapTransaction: string; // base64-encoded VersionedTransaction
  lastValidBlockHeight: number;
  prioritizationFeeLamports?: number;
}

export interface PriceEntry {
  usdPrice: number;
  blockId?: number;
  decimals?: number;
  priceChange24h?: number;
}

export type PriceResponse = Record<string, PriceEntry | undefined>;
