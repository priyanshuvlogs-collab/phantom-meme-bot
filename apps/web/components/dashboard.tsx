"use client";

import useSWR from "swr";
import { PositionsTable } from "@/components/positions-table";
import { SafetyPanel } from "@/components/safety-panel";
import { StatCards } from "@/components/stat-cards";
import { TradePanel } from "@/components/trade-panel";
import { TradesTable } from "@/components/trades-table";
import { WatchlistPanel } from "@/components/watchlist-panel";
import { Badge } from "@/components/ui/badge";
import type { PositionDto, StatusResponse, TradeDto, WatchlistItemDto } from "@/lib/types";
import { jsonFetcher } from "@/lib/utils";

const POLL_MS = 5000;

export function Dashboard() {
  const { data: status } = useSWR<StatusResponse>("/api/status", jsonFetcher, {
    refreshInterval: POLL_MS,
  });
  const { data: positions, mutate: mutatePositions } = useSWR<PositionDto[]>(
    "/api/positions?all=true",
    jsonFetcher,
    { refreshInterval: POLL_MS },
  );
  const { data: trades, mutate: mutateTrades } = useSWR<TradeDto[]>(
    "/api/trades?limit=50",
    jsonFetcher,
    { refreshInterval: POLL_MS },
  );
  const { data: watchlist, mutate: mutateWatchlist } = useSWR<WatchlistItemDto[]>(
    "/api/watchlist",
    jsonFetcher,
    { refreshInterval: POLL_MS * 2 },
  );

  const refreshAll = () => {
    void mutatePositions();
    void mutateTrades();
    void mutateWatchlist();
  };

  const engineFresh =
    status?.engineLastTickAt != null && Date.now() - status.engineLastTickAt < 60_000;

  return (
    <main className="mx-auto max-w-7xl space-y-4 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-strong text-lg">
            👻
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Phantom Meme Bot</h1>
            <p className="text-xs text-muted">Solana meme coin trading · Jupiter routing</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={engineFresh ? "success" : "muted"}>
            engine {engineFresh ? "running" : "idle"}
          </Badge>
          {status && (
            <Badge variant={status.mode === "paper" ? "default" : "danger"}>
              {status.mode === "paper" ? "PAPER MODE" : "LIVE MODE"}
            </Badge>
          )}
        </div>
      </header>

      {status?.mode === "live" && (
        <div className="rounded-xl border border-danger/50 bg-danger/10 p-3 text-sm text-danger">
          <strong>Live mode.</strong> Trades on this page and in the engine use real funds. Meme
          coins can go to zero in minutes.
        </div>
      )}

      <StatCards status={status} positions={positions} />

      <div className="grid gap-4 lg:grid-cols-2">
        <TradePanel status={status} onChanged={refreshAll} />
        <SafetyPanel />
      </div>

      <PositionsTable positions={positions} onChanged={refreshAll} />

      <div className="grid gap-4 lg:grid-cols-2">
        <WatchlistPanel watchlist={watchlist} onChanged={refreshAll} />
        <TradesTable trades={trades} />
      </div>

      <footer className="border-t border-border pt-4 pb-8 text-center text-[11px] leading-relaxed text-muted">
        Phantom Meme Bot is open-source software provided for educational purposes, not financial
        advice. Meme coin trading is extremely high risk — most meme coins lose the majority of
        their value, and bugs, rugs, and network failures can cause total loss. Never trade funds
        you cannot afford to lose, and always start in paper mode.
      </footer>
    </main>
  );
}
