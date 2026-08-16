"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { WatchlistItemDto } from "@/lib/types";
import { fmtUsd, shortAddr } from "@/lib/utils";

export function WatchlistPanel({
  watchlist,
  onChanged,
}: {
  watchlist: WatchlistItemDto[] | undefined;
  onChanged: () => void;
}) {
  const [mint, setMint] = useState("");
  const [dip, setDip] = useState("10");
  const [size, setSize] = useState("0.05");
  const [rise, setRise] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mint: mint.trim(),
          dipBuyPct: dip ? Number(dip) : null,
          dipBuySizeSol: size ? Number(size) : null,
          riseSellPct: rise ? Number(rise) : null,
        }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? "failed");
      setMint("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(itemMint: string) {
    await fetch(`/api/watchlist?mint=${encodeURIComponent(itemMint)}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Watchlist · dip-buy & rise-sell</CardTitle>
        <CardDescription>
          The engine buys dips and ladders out on rises for these tokens (run <code>pnpm bot</code>)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={add} className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <Input
            className="col-span-2 font-mono text-xs"
            placeholder="Token mint address"
            value={mint}
            onChange={(e) => setMint(e.target.value)}
            required
          />
          <Input placeholder="Dip %" type="number" step="any" value={dip} onChange={(e) => setDip(e.target.value)} />
          <Input placeholder="Size SOL" type="number" step="any" value={size} onChange={(e) => setSize(e.target.value)} />
          <div className="flex gap-2">
            <Input placeholder="Rise %" type="number" step="any" value={rise} onChange={(e) => setRise(e.target.value)} />
            <Button type="submit" disabled={busy || !mint}>
              {busy ? "…" : "Add"}
            </Button>
          </div>
        </form>
        {error && <p className="rounded-lg bg-danger/10 p-2 text-xs text-danger">{error}</p>}

        {!watchlist || watchlist.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">Watchlist is empty.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="pb-2 pr-3">Token</th>
                <th className="pb-2 pr-3">Reference</th>
                <th className="pb-2 pr-3">Dip buy</th>
                <th className="pb-2 pr-3">Rise sell</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {watchlist.map((item) => (
                <tr key={item.mint} className="border-b border-border/50">
                  <td className="py-2 pr-3">
                    <span className="font-semibold">{item.symbol}</span>{" "}
                    <span className="font-mono text-[11px] text-muted">{shortAddr(item.mint)}</span>
                    {!item.enabled && <Badge variant="muted">off</Badge>}
                  </td>
                  <td className="py-2 pr-3">{fmtUsd(item.referencePriceUsd)}</td>
                  <td className="py-2 pr-3">
                    {item.dipBuyPct != null ? `-${item.dipBuyPct}% → ${item.dipBuySizeSol} SOL` : "—"}
                  </td>
                  <td className="py-2 pr-3">
                    {item.riseSellPct != null
                      ? `+${item.riseSellPct}% → sell ${item.riseSellPortionPct ?? 100}%`
                      : "—"}
                  </td>
                  <td className="py-2 text-right">
                    <Button variant="ghost" size="sm" onClick={() => remove(item.mint)}>
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
