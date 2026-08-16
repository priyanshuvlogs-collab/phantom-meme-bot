import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtUsd(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  const d = abs > 0 && abs < 0.01 ? 8 : digits;
  return `$${value.toLocaleString(undefined, {
    maximumFractionDigits: d,
    minimumFractionDigits: Math.min(2, d),
  })}`;
}

export function fmtSol(value: number | null | undefined, digits = 4): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)} SOL`;
}

export function fmtPct(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function shortAddr(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;
}

export const jsonFetcher = async <T>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
};
