"use client";

import { Card, CardContent } from "@/components/ui/card";
import { fmtSol, fmtUsd } from "@/lib/utils";
import type { PositionDto, StatusResponse } from "@/lib/types";

export function StatCards({
  status,
  positions,
}: {
  status: StatusResponse | undefined;
  positions: PositionDto[] | undefined;
}) {
  const open = positions?.filter((p) => p.status === "open") ?? [];
  const unrealizedUsd = open.reduce((sum, p) => sum + (p.pnl.unrealizedPnlUsd ?? 0), 0);
  const totalValueUsd = open.reduce((sum, p) => sum + (p.pnl.currentValueUsd ?? 0), 0);
  const realizedSol = (positions ?? []).reduce((sum, p) => sum + p.realizedPnlSol, 0);

  const stats: { label: string; value: string; accent?: "up" | "down" }[] = [
    {
      label: status?.mode === "paper" ? "Paper balance" : "Trading mode",
      value:
        status?.mode === "paper" ? fmtSol(status?.paperBalanceSol ?? undefined) : "LIVE",
    },
    { label: "Open positions value", value: fmtUsd(totalValueUsd) },
    {
      label: "Unrealized PnL",
      value: fmtUsd(unrealizedUsd),
      accent: unrealizedUsd >= 0 ? "up" : "down",
    },
    {
      label: "Realized PnL",
      value: fmtSol(realizedSol),
      accent: realizedSol >= 0 ? "up" : "down",
    },
    { label: "SOL price", value: fmtUsd(status?.solPriceUsd) },
    {
      label: "Daily loss / halt",
      value: `${(status?.dailyRealizedLossSol ?? 0).toFixed(3)} / ${status?.limits.maxDailyLossSol ?? "—"} SOL`,
      accent:
        status && status.dailyRealizedLossSol >= status.limits.maxDailyLossSol ? "down" : undefined,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="p-4">
            <p className="text-[11px] uppercase tracking-wider text-muted">{stat.label}</p>
            <p
              className={`mt-1 truncate text-lg font-semibold ${
                stat.accent === "up"
                  ? "text-success"
                  : stat.accent === "down"
                    ? "text-danger"
                    : ""
              }`}
            >
              {stat.value}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
