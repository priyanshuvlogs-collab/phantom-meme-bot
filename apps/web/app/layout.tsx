import type { Metadata } from "next";
import { loadConfig } from "@phantom-meme-bot/core";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Phantom Meme Bot",
  description:
    "Open-source Solana meme coin trading bot — Jupiter routing, Phantom wallet, paper trading by default.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const config = loadConfig();
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">
        <Providers rpcUrl={config.SOLANA_RPC_URL}>{children}</Providers>
      </body>
    </html>
  );
}
