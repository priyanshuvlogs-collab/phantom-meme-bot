"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { SafetyReportDto } from "@/lib/types";

export function SafetyPanel() {
  const [mint, setMint] = useState("");
  const [report, setReport] = useState<SafetyReportDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function check(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch(`/api/safety?mint=${encodeURIComponent(mint.trim())}`);
      const data = (await res.json()) as SafetyReportDto & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "check failed");
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Token safety screen</CardTitle>
        <CardDescription>
          Mint & freeze authority, holder concentration, liquidity. Run this before any buy.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form onSubmit={check} className="flex gap-2">
          <Input
            className="font-mono text-xs"
            placeholder="Token mint address"
            value={mint}
            onChange={(e) => setMint(e.target.value)}
            required
          />
          <Button type="submit" disabled={busy || !mint}>
            {busy ? "Checking…" : "Check"}
          </Button>
        </form>
        {error && <p className="rounded-lg bg-danger/10 p-2 text-xs text-danger">{error}</p>}
        {report && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{report.symbol}</span>
              <span className="text-xs text-muted">{report.name}</span>
              <Badge variant={report.passed ? "success" : "danger"}>
                {report.passed ? "passed" : "failed"}
              </Badge>
            </div>
            <ul className="space-y-1.5">
              {report.checks.map((check) => (
                <li key={check.id} className="rounded-lg bg-surface-2 p-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className={check.passed ? "text-success" : "text-danger"}>
                      {check.passed ? "✔" : "✘"} {check.label}
                    </span>
                    <span className="font-mono text-muted">{check.value}</span>
                  </div>
                  {check.detail && <p className="mt-1 text-muted">{check.detail}</p>}
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-muted">
              Passing does not mean safe — these filters only catch the most common rug mechanics.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
