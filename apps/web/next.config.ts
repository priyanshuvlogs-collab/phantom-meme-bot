import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native module (SQLite) and the core package that loads it must run in
  // Node, not be bundled by webpack/turbopack.
  serverExternalPackages: ["better-sqlite3", "@phantom-meme-bot/core"],
  output: "standalone",
};

export default nextConfig;
