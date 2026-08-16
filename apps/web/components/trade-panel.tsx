"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { WalletButton } from "@/components/wallet-button";
import type { QuoteDto, StatusResponse } from "@/lib/types";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const LAMPORTS_PER_SOL = 1_000_000_000;

type Flow = "bot" | "phantom";

export function TradePanel({
  status,
  onChanged,
}: {
  status: StatusResponse | undefined;
  onChanged: () => void;
}) {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [flow, setFlow] = useState<Flow>("bot");
  const [mint, setMint] = useState("");
  const [solAmount, setSolAmount] = useState("0.05");
  const [tp, setTp] = useState("");
  const [sl, setSl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const isPaper = status?.mode !== "live";

  async function botBuy(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/trade", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "buy",
          mint: mint.trim(),
          solAmount: Number(solAmount),
          takeProfitPct: tp ? Number(tp) : undefined,
          stopLossPct: sl ? Number(sl) : undefined,
        }),
      });
      const data = (await res.json()) as { error?: string; trade?: { symbol: string } };
      if (!res.ok) throw new Error(data.error ?? "buy failed");
      setMessage({
        kind: "ok",
        text: `${isPaper ? "Paper" : "Live"} buy filled: ${data.trade?.symbol ?? mint}. Safety screen passed.`,
      });
      onChanged();
    } catch (err) {
      setMessage({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function phantomBuy(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet.publicKey) return;
    setBusy(true);
    setMessage(null);
    try {
      // 1. Quote (server-proxied so the shared rate limiter applies).
      const amountRaw = BigInt(Math.round(Number(solAmount) * LAMPORTS_PER_SOL));
      const quoteRes = await fetch(
        `/api/jupiter/quote?inputMint=${SOL_MINT}&outputMint=${mint.trim()}&amountRaw=${amountRaw}`,
      );
      const quote = (await quoteRes.json()) as QuoteDto & { error?: string };
      if (!quoteRes.ok) throw new Error(quote.error ?? "quote failed");

      // 2. Build the unsigned transaction server-side.
      const swapRes = await fetch("/api/jupiter/swap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ quoteResponse: quote, userPublicKey: wallet.publicKey.toBase58() }),
      });
      const swap = (await swapRes.json()) as { swapTransaction?: string; error?: string };
      if (!swapRes.ok || !swap.swapTransaction) throw new Error(swap.error ?? "swap build failed");

      // 3. Sign & send with Phantom — the key never leaves the wallet.
      const tx = VersionedTransaction.deserialize(
        Uint8Array.from(atob(swap.swapTransaction), (c) => c.charCodeAt(0)),
      );
      const signature = await wallet.sendTransaction(tx, connection);
      const latest = await connection.getLatestBlockhash();
      await connection.confirmTransaction({ signature, ...latest }, "confirmed");

      // 4. Record it so it shows up in positions/PnL.
      await fetch("/api/trade/record", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          side: "buy",
          mint: mint.trim(),
          inAmountRaw: quote.inAmount,
          outAmountRaw: quote.outAmount,
          txSignature: signature,
        }),
      });
      setMessage({ kind: "ok", text: `Swap confirmed: ${signature.slice(0, 16)}…` });
      onChanged();
    } catch (err) {
      setMessage({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Trade</CardTitle>
          <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
            <button
              className={`rounded-lg px-3 py-1 text-xs font-medium ${flow === "bot" ? "bg-primary-strong text-white" : "text-muted"}`}
              onClick={() => setFlow("bot")}
            >
              Bot {isPaper ? "(paper)" : "(live)"}
            </button>
            <button
              className={`rounded-lg px-3 py-1 text-xs font-medium ${flow === "phantom" ? "bg-primary-strong text-white" : "text-muted"}`}
              onClick={() => setFlow("phantom")}
            >
              Phantom (real)
            </button>
          </div>
        </div>
        <CardDescription>
          {flow === "bot"
            ? isPaper
              ? "Simulated fill against a real Jupiter quote. Safety screen runs first."
              : "Server-side live trade signed by the configured burner wallet."
            : "Signs with your connected Phantom wallet — this sends a REAL transaction."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {flow === "phantom" && (
          <div className="mb-4 space-y-3">
            <div className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
              Real funds. No paper simulation, no TP/SL automation unless the engine is running with
              a burner key. Run the safety check on the mint first.
            </div>
            <WalletButton />
          </div>
        )}
        <form onSubmit={flow === "bot" ? botBuy : phantomBuy} className="space-y-3">
          <Input
            className="font-mono text-xs"
            placeholder="Token mint address (e.g. DezXAZ… for BONK)"
            value={mint}
            onChange={(e) => setMint(e.target.value)}
            required
          />
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted">
                SOL amount
              </label>
              <Input
                type="number"
                step="any"
                min="0"
                value={solAmount}
                onChange={(e) => setSolAmount(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted">
                Take profit %
              </label>
              <Input
                type="number"
                step="any"
                placeholder={String(status?.limits.defaultTakeProfitPct ?? 50)}
                value={tp}
                onChange={(e) => setTp(e.target.value)}
                disabled={flow === "phantom"}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted">
                Stop loss %
              </label>
              <Input
                type="number"
                step="any"
                placeholder={String(status?.limits.defaultStopLossPct ?? 20)}
                value={sl}
                onChange={(e) => setSl(e.target.value)}
                disabled={flow === "phantom"}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              type="submit"
              variant={flow === "phantom" ? "danger" : "success"}
              disabled={busy || !mint || (flow === "phantom" && !wallet.publicKey)}
              className="flex-1"
            >
              {busy
                ? "Working…"
                : flow === "phantom"
                  ? "Swap with Phantom (REAL)"
                  : isPaper
                    ? "Paper buy"
                    : "Live buy (server wallet)"}
            </Button>
            <Badge variant={isPaper && flow === "bot" ? "default" : "danger"}>
              {flow === "phantom" ? "REAL" : status?.mode ?? "…"}
            </Badge>
          </div>
        </form>
        {message && (
          <p
            className={`mt-3 rounded-lg p-2 text-xs ${
              message.kind === "ok" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
            }`}
          >
            {message.text}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
