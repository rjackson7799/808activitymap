import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captureError = vi.hoisted(() => vi.fn());
const testEnv = vi.hoisted(() => ({
  EVENTS_INTERNAL_TOKEN: "test-internal-token",
  EVENTS_INGEST_ORIGIN: "https://trusted.example",
}));

vi.mock("@/config/env", () => ({ env: () => testEnv }));
vi.mock("@/lib/observability/log", () => ({ captureError }));

import { postServerEvent } from "@/lib/analytics/server-capture";

const event = {
  name: "listing_view" as const,
  slug: "aloha-ramen-hale",
  locale: "en",
  sessionId: "00000000-0000-4000-8000-000000000001",
};

describe("trusted analytics server capture", () => {
  beforeEach(() => {
    captureError.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts only to the configured origin when forwarded metadata is hostile", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await postServerEvent(event, {
      userAgent: "browser",
      referer: "https://attacker.example/",
      landingQuery: "next=https://attacker.example/",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [destination, init] = fetchMock.mock.calls[0]!;
    expect(destination).toEqual(new URL("https://trusted.example/api/events"));
    expect(init).toMatchObject({ method: "POST", redirect: "error" });
    expect(init.headers).toMatchObject({ "x-events-internal": "test-internal-token" });
  });

  it("rejects redirect following for the secret-bearing request", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("redirect mode is set to error"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      postServerEvent(event, { userAgent: null, referer: null, landingQuery: null }),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ redirect: "error" });
    expect(captureError).toHaveBeenCalledTimes(1);
  });
});
