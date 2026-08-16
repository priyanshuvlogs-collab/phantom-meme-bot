"use client";

import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import { useMemo } from "react";
import "@solana/wallet-adapter-react-ui/styles.css";

/**
 * Wallet context for the interactive Phantom flow. The RPC endpoint is
 * injected from the server via layout so the browser uses the same RPC as
 * the bot (falls back to the public endpoint).
 */
export function Providers({
  children,
  rpcUrl,
}: {
  children: React.ReactNode;
  rpcUrl: string;
}) {
  // Phantom is the primary target; the standard-wallet spec means other
  // installed wallets are auto-detected by the adapter as well.
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={rpcUrl}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
