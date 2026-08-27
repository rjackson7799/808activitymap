import { captureError } from "@/lib/observability/log";

/**
 * Next.js instrumentation (CP5). Today this is the structured-logging seam
 * (ADR: Sentry-ready seam over the SDK). `register()` is where OTel/Sentry
 * init drops in behind `SENTRY_DSN`; `onRequestError` funnels every unhandled
 * server/route error into the one capture choke point (`lib/observability`).
 * No client bundle, no new dependency — the Lighthouse budget stays clean.
 */

export async function register(): Promise<void> {
  // Intentionally empty. TODO(SENTRY_DSN): initialize Sentry/OTel here.
}

export function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routeType?: string; routePath?: string },
): void {
  captureError(error, {
    where: "onRequestError",
    path: request.path,
    method: request.method,
    routeType: context.routeType,
    routePath: context.routePath,
  });
}
