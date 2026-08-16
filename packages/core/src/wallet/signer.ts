import fs from "node:fs";
import path from "node:path";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { loadConfig } from "../config.js";
import { getLogger } from "../logger.js";

const log = getLogger("wallet");

/**
 * Loads the automation signer for headless (CLI/engine) live trading.
 *
 * SECURITY MODEL
 * - Paper mode never needs a key; this function is only called on the live
 *   execution path.
 * - Keys are only ever read from the environment (.env) at runtime — never
 *   hardcoded, never written to disk or the database by this codebase.
 * - The interactive web dashboard signs with Phantom in the browser instead,
 *   so the server never sees a private key in that flow.
 *
 * Use a dedicated burner wallet. Anyone with this key controls the funds.
 */
export function loadSigner(): Keypair {
  const config = loadConfig();

  if (config.WALLET_KEYPAIR_PATH && config.WALLET_PRIVATE_KEY_BASE58) {
    throw new Error(
      "Both WALLET_KEYPAIR_PATH and WALLET_PRIVATE_KEY_BASE58 are set — configure exactly one.",
    );
  }

  if (config.WALLET_KEYPAIR_PATH) {
    const file = path.isAbsolute(config.WALLET_KEYPAIR_PATH)
      ? config.WALLET_KEYPAIR_PATH
      : path.resolve(config.rootDir, config.WALLET_KEYPAIR_PATH);
    const secret = JSON.parse(fs.readFileSync(file, "utf8")) as number[];
    const keypair = Keypair.fromSecretKey(Uint8Array.from(secret));
    warnLoaded(keypair);
    return keypair;
  }

  if (config.WALLET_PRIVATE_KEY_BASE58) {
    const keypair = Keypair.fromSecretKey(bs58.decode(config.WALLET_PRIVATE_KEY_BASE58.trim()));
    warnLoaded(keypair);
    return keypair;
  }

  throw new Error(
    "No signer configured. Set WALLET_KEYPAIR_PATH (preferred) or WALLET_PRIVATE_KEY_BASE58 " +
      "in .env — and use a dedicated burner wallet, never your main wallet.",
  );
}

function warnLoaded(keypair: Keypair): void {
  log.warn(
    { publicKey: keypair.publicKey.toBase58() },
    "loaded hot wallet signer — ensure this is a BURNER wallet with limited funds",
  );
}

/** Returns the signer's public key without throwing if none is configured. */
export function tryGetSignerPublicKey(): string | undefined {
  try {
    return loadSigner().publicKey.toBase58();
  } catch {
    return undefined;
  }
}
