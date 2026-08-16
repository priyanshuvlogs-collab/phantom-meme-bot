/** Shapes returned by the API routes (client-side mirror of core types). */

export interface StatusResponse {
  mode: "paper" | "live";
  paperBalanceSol: number | null;
  dailyRealizedLossSol: number;
  openPositions: number;
  limits: {
    maxPositionSizeSol: number;
    maxOpenPositions: number;
    maxDailyLossSol: number;
    defaultTakeProfitPct: number;
    defaultStopLossPct: number;
    slippageBps: number;
  };
  solPriceUsd: number | null;
  engineLastTickAt: number | null;
}

export interface PositionPnlDto {
  tokenAmountUi: number;
  currentPriceUsd?: number;
  currentValueUsd?: number;
  costBasisSol: number;
  unrealizedPnlUsd?: number;
  unrealizedPnlPct?: number;
  realizedPnlSol: number;
}

export interface PositionDto {
  id: string;
  mint: string;
  symbol: string;
  decimals: number;
  mode: "paper" | "live";
  status: "open" | "closed";
  tokenAmountRaw: string;
  entryPriceUsd: number;
  takeProfitPct: number | null;
  stopLossPct: number | null;
  realizedPnlSol: number;
  openedAt: string;
  closedAt: string | null;
  pnl: PositionPnlDto;
}

export interface TradeDto {
  id: string;
  positionId: string | null;
  mint: string;
  symbol: string;
  side: "buy" | "sell";
  mode: "paper" | "live";
  status: "simulated" | "confirmed" | "failed";
  reason: string;
  inAmountRaw: string;
  outAmountRaw: string;
  priceUsd: number | null;
  txSignature: string | null;
  createdAt: string;
}

export interface WatchlistItemDto {
  mint: string;
  symbol: string;
  enabled: boolean;
  referencePriceUsd: number | null;
  dipBuyPct: number | null;
  dipBuySizeSol: number | null;
  riseSellPct: number | null;
  riseSellPortionPct: number | null;
  cooldownMs: number;
}

export interface SafetyCheckDto {
  id: string;
  label: string;
  passed: boolean;
  value: string;
  detail?: string;
}

export interface SafetyReportDto {
  mint: string;
  symbol: string;
  name: string;
  passed: boolean;
  checks: SafetyCheckDto[];
}

export interface QuoteDto {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: { swapInfo: { label?: string }; percent: number }[];
}
