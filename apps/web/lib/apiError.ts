import { NextResponse } from "next/server";

/** Uniform error envelope for API routes. */
export async function handleApi<T>(fn: () => Promise<T> | T): Promise<NextResponse> {
  try {
    return NextResponse.json(await fn());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status =
      err instanceof Error && (err.name === "RiskLimitError" || err.name === "SafetyError")
        ? 422
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
