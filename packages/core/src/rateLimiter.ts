import { getLogger } from "./logger.js";

const log = getLogger("http");

/**
 * Minimal token-bucket rate limiter. Callers `await limiter.acquire()` before
 * making a request; excess calls queue and drain at the configured rate.
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill = Date.now();
  private readonly queue: Array<() => void> = [];
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly maxTokens: number,
    private readonly refillPerSecond: number,
  ) {
    this.tokens = maxTokens;
  }

  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    await new Promise<void>((resolve) => {
      this.queue.push(resolve);
      this.scheduleDrain();
    });
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillPerSecond);
    this.lastRefill = now;
  }

  private scheduleDrain(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.refill();
      while (this.tokens >= 1 && this.queue.length > 0) {
        this.tokens -= 1;
        this.queue.shift()!();
      }
      if (this.queue.length === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = undefined;
      }
    }, 100);
    // Don't keep the process alive just for queued requests.
    this.timer.unref?.();
  }
}

export interface FetchJsonOptions extends RequestInit {
  limiter?: RateLimiter;
  retries?: number;
  timeoutMs?: number;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    public readonly body: string,
  ) {
    super(`HTTP ${status} from ${url}: ${body.slice(0, 300)}`);
    this.name = "HttpError";
  }
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

/**
 * fetch wrapper with rate limiting, timeout, and exponential backoff on
 * transient failures (429s from public APIs are expected, not exceptional).
 */
export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const { limiter, retries = 3, timeoutMs = 15_000, ...init } = options;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (limiter) await limiter.acquire();
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        if (RETRYABLE_STATUS.has(res.status) && attempt < retries) {
          const retryAfter = Number(res.headers.get("retry-after")) * 1000 || 0;
          const delay = Math.max(retryAfter, 500 * 2 ** attempt);
          log.warn({ url, status: res.status, attempt, delay }, "retrying request");
          await sleep(delay);
          continue;
        }
        throw new HttpError(res.status, url, body);
      }
      return (await res.json()) as T;
    } catch (err) {
      lastError = err;
      if (err instanceof HttpError) throw err;
      if (attempt < retries) {
        const delay = 500 * 2 ** attempt;
        log.warn({ url, attempt, delay, err: String(err) }, "request failed, retrying");
        await sleep(delay);
        continue;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
