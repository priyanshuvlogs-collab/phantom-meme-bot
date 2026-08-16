import pino, { type Logger } from "pino";

export type { Logger };

let root: Logger | undefined;

export function getLogger(name?: string): Logger {
  if (!root) {
    root = pino({
      level: process.env.LOG_LEVEL ?? "info",
      base: undefined,
      timestamp: pino.stdTimeFunctions.isoTime,
      // pino-pretty is opt-in for local runs; JSON logs by default so they can
      // be shipped to any aggregator when running in Docker.
      transport:
        process.stdout.isTTY && process.env.LOG_JSON !== "true"
          ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } }
          : undefined,
    });
  }
  return name ? root.child({ mod: name }) : root;
}
