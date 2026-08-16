"use client";

import dynamic from "next/dynamic";

/** WalletMultiButton touches `window`; render client-side only. */
export const WalletButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false, loading: () => <div className="h-10 w-36 rounded-xl bg-surface-2" /> },
);
