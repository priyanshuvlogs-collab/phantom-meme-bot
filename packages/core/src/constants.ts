/** Wrapped SOL mint — Jupiter uses this to represent native SOL. */
export const SOL_MINT = "So11111111111111111111111111111111111111112";

export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export const LAMPORTS_PER_SOL = 1_000_000_000;

export function solToLamports(sol: number): bigint {
  return BigInt(Math.round(sol * LAMPORTS_PER_SOL));
}

export function lamportsToSol(lamports: bigint | number | string): number {
  return Number(lamports) / LAMPORTS_PER_SOL;
}

/** Convert a raw token amount (base units) to a UI amount given decimals. */
export function rawToUi(raw: bigint | string, decimals: number): number {
  return Number(raw) / 10 ** decimals;
}

export function uiToRaw(ui: number, decimals: number): bigint {
  return BigInt(Math.round(ui * 10 ** decimals));
}
