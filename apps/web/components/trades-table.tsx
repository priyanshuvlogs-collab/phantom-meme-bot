"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { TradeDto } from "@/lib/types";
import { fmtUsd, shortAddr } from "@/lib/utils";

export function TradesTable({ trades }: { trades: TradeDto[] | undefined }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Trade history</CardTitle>
        <CardDescription>Most recent first — includes strategy-triggered trades</CardDescription>
      </CardHeader>
      <CardContent>
        {!trades || trades.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No trades yet.</p>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted">
                  <th className="pb-2 pr-3">Time</th>
                  <th className="pb-2 pr-3">Side</th>
                  <th className="pb-2 pr-3">Token</th>
                  <th className="pb-2 pr-3">Reason</th>
                  <th className="pb-2 pr-3">Price</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((trade) => (
                  <tr key={trade.id} className="border-b border-border/50">
                    <td className="py-2 pr-3 text-xs text-muted">
                      {new Date(trade.createdAt).toLocaleString()}
                    </td>
                    <td className={`py-2 pr-3 font-semibold ${trade.side === "buy" ? "text-success" : "text-danger"}`}>
                      {trade.side.toUpperCase()}
                    </td>
                    <td className="py-2 pr-3">{trade.symbol}</td>
                    <td className="py-2 pr-3">
                      <Badge variant={trade.reason === "manual" ? "muted" : "default"}>
                        {trade.reason.replace("_", " ")}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3">{fmtUsd(trade.priceUsd)}</td>
                    <td className="py-2">
                      {trade.txSignature ? (
                        <a
                          className="font-mono text-xs text-primary hover:underline"
                          href={`https://solscan.io/tx/${trade.txSignature}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {shortAddr(trade.txSignature)}
                        </a>
                      ) : (
                        <Badge variant={trade.status === "failed" ? "danger" : "muted"}>
                          {trade.status}
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
