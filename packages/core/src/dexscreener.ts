import { RateLimiter, fetchJson } from "./rateLimiter.js";

/**
 * DexScreener public API — used for liquidity data and token metadata.
 * Free, no key, ~300 req/min; we self-limit well below that.
 */

const limiter = new RateLimiter(3, 2);

export interface DexPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceUsd?: string;
  liquidity?: { usd?: number; base?: number; quote?: number };
  volume?: { h24?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
}

export async function getPairsForToken(mint: string): Promise<DexPair[]> {
  const pairs = await fetchJson<DexPair[]>(
    `https://api.dexscreener.com/token-pairs/v1/solana/${mint}`,
    { limiter },
  );
  return Array.isArray(pairs) ? pairs : [];
}

export interface TokenMarketInfo {
  symbol: string;
  name: string;
  /** Sum of liquidity across all Solana pairs, USD. */
  totalLiquidityUsd: number;
  /** Deepest single pool, USD. */
  deepestPoolUsd: number;
  volume24hUsd: number;
  pairCount: number;
  oldestPairCreatedAt: number | undefined;
}

export async function getTokenMarketInfo(mint: string): Promise<TokenMarketInfo | undefined> {
  const pairs = (await getPairsForToken(mint)).filter((p) => p.chainId === "solana");
  if (pairs.length === 0) return undefined;

  const base = pairs.find((p) => p.baseToken.address === mint)?.baseToken;
  let totalLiquidityUsd = 0;
  let deepestPoolUsd = 0;
  let volume24hUsd = 0;
  let oldest: number | undefined;
  for (const pair of pairs) {
    const liq = pair.liquidity?.usd ?? 0;
    totalLiquidityUsd += liq;
    deepestPoolUsd = Math.max(deepestPoolUsd, liq);
    volume24hUsd += pair.volume?.h24 ?? 0;
    if (pair.pairCreatedAt && (oldest === undefined || pair.pairCreatedAt < oldest)) {
      oldest = pair.pairCreatedAt;
    }
  }
  return {
    symbol: base?.symbol ?? "?",
    name: base?.name ?? "Unknown",
    totalLiquidityUsd,
    deepestPoolUsd,
    volume24hUsd,
    pairCount: pairs.length,
    oldestPairCreatedAt: oldest,
  };
}
