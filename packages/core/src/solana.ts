import { Connection } from "@solana/web3.js";
import { loadConfig } from "./config.js";

let connection: Connection | undefined;

export function getConnection(): Connection {
  if (!connection) {
    const config = loadConfig();
    connection = new Connection(config.SOLANA_RPC_URL, config.SOLANA_COMMITMENT);
  }
  return connection;
}
