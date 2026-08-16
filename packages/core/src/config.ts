import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

/**
 * Walk up from `cwd` looking for a `.env` file so the bot can be started from
 * any workspace package (apps/cli, apps/web, repo root, ...).
 */
export function findEnvFile(startDir = process.cwd()): string | undefined {
  return findUp(".env", startDir);
}

/**
 * Anchor for relative paths (DATABASE_PATH, keypair path) when no .env
 * exists: the monorepo root, so CLI, engine and dashboard share one database
 * regardless of which directory they were started from.
 */
export function findWorkspaceRoot(startDir = process.cwd()): string | undefined {
  const marker = findUp("pnpm-workspace.yaml", startDir);
  return marker ? path.dirname(marker) : undefined;
}

function findUp(fileName: string, startDir: string): string | undefined {
  let dir = startDir;
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, fileName);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

const booleanString = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const envSchema = z.object({
  TRADING_MODE: z.enum(["paper", "live"]).default("paper"),
  LIVE_TRADING_ACKNOWLEDGED: booleanString,
  PAPER_STARTING_BALANCE_SOL: z.coerce.number().positive().default(10),

  SOLANA_RPC_URL: z.string().url().default("https://api.mainnet-beta.solana.com"),
  SOLANA_COMMITMENT: z.enum(["processed", "confirmed", "finalized"]).default("confirmed"),

  WALLET_KEYPAIR_PATH: z.string().optional(),
  WALLET_PRIVATE_KEY_BASE58: z.string().optional(),

  JUPITER_API_BASE_URL: z.string().url().default("https://lite-api.jup.ag"),
  JUPITER_API_KEY: z.string().optional(),
  SLIPPAGE_BPS: z.coerce.number().int().min(1).max(5000).default(100),
  PRIORITY_FEE_LAMPORTS: z
    .union([z.literal("auto"), z.coerce.number().int().nonnegative()])
    .default("auto"),

  MAX_POSITION_SIZE_SOL: z.coerce.number().positive().default(0.1),
  MAX_OPEN_POSITIONS: z.coerce.number().int().positive().default(5),
  MAX_DAILY_LOSS_SOL: z.coerce.number().positive().default(0.5),
  DEFAULT_TAKE_PROFIT_PCT: z.coerce.number().positive().default(50),
  DEFAULT_STOP_LOSS_PCT: z.coerce.number().positive().max(100).default(20),

  SAFETY_MIN_LIQUIDITY_USD: z.coerce.number().nonnegative().default(20000),
  SAFETY_MAX_TOP10_HOLDER_PCT: z.coerce.number().positive().max(100).default(40),
  SAFETY_REQUIRE_MINT_AUTHORITY_REVOKED: booleanString,
  SAFETY_REQUIRE_FREEZE_AUTHORITY_REVOKED: booleanString,
  SAFETY_ALLOW_UNVERIFIED_TOP_HOLDERS: booleanString,

  PRICE_POLL_INTERVAL_MS: z.coerce.number().int().min(1000).default(5000),
  STRATEGY_TICK_INTERVAL_MS: z.coerce.number().int().min(1000).default(10000),

  DATABASE_PATH: z.string().default("./data/bot.db"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
});

export type BotConfig = z.infer<typeof envSchema> & {
  /** Directory the .env file was found in (or cwd) — relative paths resolve against it. */
  rootDir: string;
  /** Absolute path to the SQLite database file. */
  databaseFile: string;
  isPaper: boolean;
};

let cached: BotConfig | undefined;

export function loadConfig(): BotConfig {
  if (cached) return cached;

  const envFile = findEnvFile();
  if (envFile) dotenv.config({ path: envFile, quiet: true });

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid configuration in .env:\n${issues}`);
  }

  const env = parsed.data;
  const rootDir = envFile ? path.dirname(envFile) : (findWorkspaceRoot() ?? process.cwd());

  if (env.TRADING_MODE === "live" && !env.LIVE_TRADING_ACKNOWLEDGED) {
    throw new Error(
      "TRADING_MODE=live requires LIVE_TRADING_ACKNOWLEDGED=true.\n" +
        "Live trading sends REAL transactions and can lose 100% of deployed funds.\n" +
        "Set the flag only after testing thoroughly in paper mode with a burner wallet.",
    );
  }

  const databaseFile = path.isAbsolute(env.DATABASE_PATH)
    ? env.DATABASE_PATH
    : path.resolve(rootDir, env.DATABASE_PATH);

  cached = {
    ...env,
    rootDir,
    databaseFile,
    isPaper: env.TRADING_MODE === "paper",
  };
  return cached;
}

/** Test helper — clears the memoized config. */
export function resetConfigCache(): void {
  cached = undefined;
}
