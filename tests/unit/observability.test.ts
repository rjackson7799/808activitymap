import { afterEach, describe, expect, it, vi } from "vitest";
import { captureError, logEvent } from "@/lib/observability/log";
import { onRequestError } from "@/instrumentation";

/** The observability seam: structured JSON to the right console stream, and the
 * Next onRequestError hook funnelling into captureError. */

afterEach(() => vi.restoreAllMocks());

describe("captureError", () => {
  it("emits a structured error line with message + context", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    captureError(new Error("boom"), { where: "unit", listingId: "abc" });
    expect(spy).toHaveBeenCalledOnce();
    const payload = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(payload.observability.level).toBe("error");
    expect(payload.observability.message).toBe("boom");
    expect(payload.observability.where).toBe("unit");
    expect(payload.observability.listingId).toBe("abc");
  });

  it("stringifies non-Error throwables", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    captureError("plain string failure");
    expect(JSON.parse(spy.mock.calls[0]![0] as string).observability.message).toBe(
      "plain string failure",
    );
  });
});

describe("logEvent", () => {
  it("routes levels to the matching console stream", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    logEvent("warn", "heads up", { n: 1 });
    logEvent("info", "fyi");
    expect(warn).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledOnce();
    expect(JSON.parse(warn.mock.calls[0]![0] as string).observability.n).toBe(1);
  });
});

describe("onRequestError", () => {
  it("funnels a request error into captureError with route context", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    onRequestError(new Error("route failed"), { path: "/spot/x", method: "GET" }, { routeType: "route" });
    const payload = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(payload.observability.where).toBe("onRequestError");
    expect(payload.observability.path).toBe("/spot/x");
    expect(payload.observability.routeType).toBe("route");
  });
});
