import chalk from "chalk";

export function fmtUsd(value: number | undefined, digits = 2): string {
  if (value === undefined) return chalk.gray("—");
  const abs = Math.abs(value);
  // Meme coin prices are often sub-cent; show enough precision to be useful.
  const d = abs > 0 && abs < 0.01 ? 8 : digits;
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: Math.min(2, d) })}`;
}

export function fmtSol(value: number | undefined, digits = 4): string {
  if (value === undefined) return chalk.gray("—");
  return `${value.toFixed(digits)} SOL`;
}

export function fmtPct(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return chalk.gray("—");
  const s = `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
  return value >= 0 ? chalk.green(s) : chalk.red(s);
}

export function fmtSigned(value: number | undefined, unit: string, digits = 4): string {
  if (value === undefined) return chalk.gray("—");
  const s = `${value >= 0 ? "+" : ""}${value.toFixed(digits)} ${unit}`;
  return value >= 0 ? chalk.green(s) : chalk.red(s);
}

export function shortAddr(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;
}

export function modeBadge(mode: "paper" | "live"): string {
  return mode === "paper"
    ? chalk.bgBlue.white.bold(" PAPER ")
    : chalk.bgRed.white.bold(" LIVE ");
}
