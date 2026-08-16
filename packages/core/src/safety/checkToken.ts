import { getMint, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, type Mint } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { loadConfig } from "../config.js";
import { getTokenMarketInfo } from "../dexscreener.js";
import { getLogger } from "../logger.js";
import { getConnection } from "../solana.js";
import type { SafetyCheck, SafetyReport } from "./types.js";

const log = getLogger("safety");

/**
 * On-chain + market safety screen, run before every buy (unless explicitly
 * skipped). These checks catch the most common rug mechanics, but they are
 * NOT a guarantee: honeypot logic, LP pulls, and social rugs can pass all of
 * them. Never trade more than you can afford to lose.
 *
 * Checks:
 *  1. mint authority revoked  — otherwise the deployer can print supply
 *  2. freeze authority revoked — otherwise the deployer can freeze your ATA
 *                                and you can buy but never sell
 *  3. minimum pooled liquidity — thin pools mean brutal price impact and
 *                                a cheap rug
 *  4. top-10 holder concentration — a few wallets holding most of the float
 *                                   can dump on you at will
 */
export async function checkTokenSafety(mintAddress: string): Promise<SafetyReport> {
  const config = loadConfig();
  const connection = getConnection();
  const mintPk = new PublicKey(mintAddress);
  const checks: SafetyCheck[] = [];

  // --- On-chain mint account (try classic SPL Token, then Token-2022) ---
  let mint: Mint | undefined;
  let isToken2022 = false;
  try {
    mint = await getMint(connection, mintPk, undefined, TOKEN_PROGRAM_ID);
  } catch {
    try {
      mint = await getMint(connection, mintPk, undefined, TOKEN_2022_PROGRAM_ID);
      isToken2022 = true;
    } catch (err) {
      log.warn({ mint: mintAddress, err: String(err) }, "failed to load mint account");
    }
  }

  if (!mint) {
    return {
      mint: mintAddress,
      symbol: "?",
      name: "Unknown",
      passed: false,
      checks: [
        {
          id: "mint_account",
          label: "Mint account exists",
          passed: false,
          value: "not found",
          detail: "Address is not a valid SPL token mint on this RPC.",
        },
      ],
      checkedAt: Date.now(),
    };
  }

  const mintRevoked = mint.mintAuthority === null;
  checks.push({
    id: "mint_authority",
    label: "Mint authority revoked",
    passed: config.SAFETY_REQUIRE_MINT_AUTHORITY_REVOKED ? mintRevoked : true,
    value: mintRevoked ? "revoked" : `active (${mint.mintAuthority?.toBase58()})`,
    detail: mintRevoked
      ? undefined
      : "Deployer can mint unlimited new supply and dilute holders to zero.",
  });

  const freezeRevoked = mint.freezeAuthority === null;
  checks.push({
    id: "freeze_authority",
    label: "Freeze authority revoked",
    passed: config.SAFETY_REQUIRE_FREEZE_AUTHORITY_REVOKED ? freezeRevoked : true,
    value: freezeRevoked ? "revoked" : `active (${mint.freezeAuthority?.toBase58()})`,
    detail: freezeRevoked
      ? undefined
      : "Deployer can freeze your token account — a classic honeypot mechanic.",
  });

  if (isToken2022) {
    checks.push({
      id: "token_2022",
      label: "Token-2022 program",
      passed: true,
      value: "yes",
      detail:
        "Token uses the Token-2022 program. Watch for transfer-fee / transfer-hook extensions not covered by these checks.",
    });
  }

  // --- Top holder concentration ---
  try {
    const largest = await connection.getTokenLargestAccounts(mintPk);
    const supply = Number(mint.supply);
    const top10 = largest.value.slice(0, 10);
    const top10Amount = top10.reduce((sum, acc) => sum + Number(acc.amount), 0);
    const top10Pct = supply > 0 ? (top10Amount / supply) * 100 : 100;
    checks.push({
      id: "top_holders",
      label: `Top-10 holders ≤ ${config.SAFETY_MAX_TOP10_HOLDER_PCT}%`,
      passed: top10Pct <= config.SAFETY_MAX_TOP10_HOLDER_PCT,
      value: `${top10Pct.toFixed(1)}%`,
      detail:
        "Includes liquidity-pool vaults, so healthy tokens often show 20–40% here. Treat very high values as a red flag.",
    });
  } catch (err) {
    // The public mainnet RPC blocks getTokenLargestAccounts. Fail closed by
    // default; SAFETY_ALLOW_UNVERIFIED_TOP_HOLDERS=true lets paper-mode users
    // on the public RPC proceed without this one check.
    checks.push({
      id: "top_holders",
      label: "Top-10 holder concentration",
      passed: config.SAFETY_ALLOW_UNVERIFIED_TOP_HOLDERS,
      value: "unavailable",
      detail:
        `Could not fetch largest accounts (${String(err)}). ` +
        "Public RPCs block this call — use a dedicated RPC provider, or set " +
        "SAFETY_ALLOW_UNVERIFIED_TOP_HOLDERS=true to skip only this check.",
    });
  }

  // --- Market data (DexScreener) ---
  let symbol = "?";
  let name = "Unknown";
  try {
    const market = await getTokenMarketInfo(mintAddress);
    if (market) {
      symbol = market.symbol;
      name = market.name;
      checks.push({
        id: "liquidity",
        label: `Liquidity ≥ $${config.SAFETY_MIN_LIQUIDITY_USD.toLocaleString()}`,
        passed: market.totalLiquidityUsd >= config.SAFETY_MIN_LIQUIDITY_USD,
        value: `$${Math.round(market.totalLiquidityUsd).toLocaleString()} across ${market.pairCount} pool(s)`,
        detail:
          market.totalLiquidityUsd < config.SAFETY_MIN_LIQUIDITY_USD
            ? "Thin liquidity: high price impact on entry and a cheap rug for the deployer."
            : undefined,
      });
    } else {
      checks.push({
        id: "liquidity",
        label: "Liquidity data available",
        passed: false,
        value: "no pools found",
        detail: "DexScreener has no Solana pools for this mint — token may be brand new or fake.",
      });
    }
  } catch (err) {
    checks.push({
      id: "liquidity",
      label: "Liquidity data available",
      passed: false,
      value: "unavailable",
      detail: `DexScreener request failed: ${String(err)}`,
    });
  }

  const report: SafetyReport = {
    mint: mintAddress,
    symbol,
    name,
    passed: checks.every((c) => c.passed),
    checks,
    checkedAt: Date.now(),
  };
  log.info(
    { mint: mintAddress, symbol, passed: report.passed },
    `safety check ${report.passed ? "PASSED" : "FAILED"}`,
  );
  return report;
}

/** Fetch mint decimals (needed for amount conversions). */
export async function getMintDecimals(mintAddress: string): Promise<number> {
  const connection = getConnection();
  const mintPk = new PublicKey(mintAddress);
  try {
    return (await getMint(connection, mintPk, undefined, TOKEN_PROGRAM_ID)).decimals;
  } catch {
    return (await getMint(connection, mintPk, undefined, TOKEN_2022_PROGRAM_ID)).decimals;
  }
}
