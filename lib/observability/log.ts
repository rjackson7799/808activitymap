/**
 * Observability seam (CP5). A single choke point for structured error/telemetry
 * logging. Today it emits JSON lines to stdout (Vercel log drains); it is the
 * one place `@sentry/nextjs` drops in behind `SENTRY_DSN` once a project/DSN is
 * provisioned (ADR: Sentry-ready seam over the SDK — the SDK's browser bundle
 * would add client JS exactly as the Lighthouse gate turns blocking, and there
 * is no DSN yet).
 *
 * Dependency-free (no `server-only`, no SDK) so it is importable from any
 * server context — route handlers, the proxy's after() capture, instrumentation.
 */

export type LogLevel = "error" | "warn" | "info";

export type LogContext = Record<string, unknown>;

interface ObservabilityRecord extends LogContext {
  level: LogLevel;
  message: string;
  stack?: string;
}

function emit(record: ObservabilityRecord): void {
  const line = JSON.stringify({ observability: record });
  if (record.level === "error") console.error(line);
  else if (record.level === "warn") console.warn(line);
  else console.log(line);
}

/**
 * Record a failure. Used for the CP5 captured classes: events-insert failure,
 * rate_limit_hit RPC failure, config fail-closed throw, revalidation errors,
 * proxy after() capture-fetch failure, and the events_default-non-empty alert.
 */
export function captureError(error: unknown, context: LogContext = {}): void {
  emit({
    level: "error",
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    ...context,
  });
  // TODO(SENTRY_DSN): Sentry.captureException(error, { extra: context });
}

/** Record a non-error structured event (drop counters, alerts, notices). */
export function logEvent(level: LogLevel, message: string, context: LogContext = {}): void {
  emit({ level, message, ...context });
}
