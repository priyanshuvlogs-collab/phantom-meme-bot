"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PositionDto } from "@/lib/types";
import { fmtPct, fmtSol, fmtUsd, shortAddr } from "@/lib/utils";

export function PositionsTable({
  positions,
  onChanged,
}: {
  positions: PositionDto[] | undefined;
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  const rows = (positions ?? []).filter((p) => showClosed || p.status === "open");

  async function sell(position: PositionDto, portionPct: number) {
    setBusyId(position.id);
    setError(null);
    try {
      const res = await fetch("/api/trade", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "sell", positionIdOrMint: position.id, portionPct }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? "sell failed");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Positions</CardTitle>
          <CardDescription>Live PnL from Jupiter price data</CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setShowClosed((v) => !v)}>
          {showClosed ? "Hide closed" : "Show closed"}
        </Button>
      </CardHeader>
      <CardContent>
        {error && <p className="mb-3 rounded-lg bg-danger/10 p-2 text-xs text-danger">{error}</p>}
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            No positions yet. Buy something from the Trade panel — paper mode is on by default.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted">
                  <th className="pb-2 pr-3">Token</th>
                  <th className="pb-2 pr-3">Amount</th>
                  <th className="pb-2 pr-3">Entry</th>
                  <th className="pb-2 pr-3">Now</th>
                  <th className="pb-2 pr-3">PnL</th>
                  <th className="pb-2 pr-3">Realized</th>
                  <th className="pb-2 pr-3">TP/SL</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((position) => {
                  const pnlUp = (position.pnl.unrealizedPnlPct ?? 0) >= 0;
                  return (
                    <tr key={position.id} className="border-b border-border/50">
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{position.symbol}</span>
                          <Badge variant={position.mode === "paper" ? "default" : "danger"}>
                            {position.mode}
                          </Badge>
                          {position.status === "closed" && <Badge variant="muted">closed</Badge>}
                        </div>
                        <a
                          className="font-mono text-[11px] text-muted hover:text-primary"
                          href={`https://solscan.io/token/${position.mint}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {shortAddr(position.mint)}
                        </a>
                      </td>
                      <td className="py-2.5 pr-3">
                        {position.pnl.tokenAmountUi.toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="py-2.5 pr-3">{fmtUsd(position.entryPriceUsd)}</td>
                      <td className="py-2.5 pr-3">{fmtUsd(position.pnl.currentPriceUsd)}</td>
                      <td className={`py-2.5 pr-3 font-medium ${pnlUp ? "text-success" : "text-danger"}`}>
                        {position.status === "open" ? (
                          <>
                            {fmtPct(position.pnl.unrealizedPnlPct)}
                            <span className="ml-1 text-xs opacity-70">
                              {fmtUsd(position.pnl.unrealizedPnlUsd)}
                            </span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td
                        className={`py-2.5 pr-3 ${position.realizedPnlSol >= 0 ? "text-success" : "text-danger"}`}
                      >
                        {fmtSol(position.realizedPnlSol)}
                      </td>
                      <td className="py-2.5 pr-3 text-muted">
                        {position.takeProfitPct ?? "—"}% / {position.stopLossPct ?? "—"}%
                      </td>
                      <td className="py-2.5 text-right">
                        {position.status === "open" && (
                          <div className="flex justify-end gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busyId === position.id}
                              onClick={() => sell(position, 50)}
                            >
                              Sell 50%
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              disabled={busyId === position.id}
                              onClick={() => sell(position, 100)}
                            >
                              {busyId === position.id ? "…" : "Sell all"}
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
