import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { TAG_PUBLIC, TAG_SITEMAP, tagForListing } from "@/lib/public-read/tags";

/**
 * On-demand revalidation endpoint (CP4). Secondary to the admin publish/unpublish actions
 * (which revalidate in-process); this is the external/ops trigger — a job or webhook that
 * changed data out-of-band can invalidate the public cache here.
 *
 * Secret-gated: reads REVALIDATE_SECRET directly (an ops-only knob, not part of the
 * fail-closed app env). If the secret is unset OR the header doesn't match → 401 (deny by
 * default). Excluded from the locale proxy via the matcher (`/api` is not rewritten).
 */
export async function POST(request: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || request.headers.get("x-revalidate-secret") !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // Route handlers can't use updateTag (Server-Action-only); revalidateTag needs a
  // cache-life profile — 'max' = purge, refresh on next visit (stale-while-revalidate).
  const body = (await request.json().catch(() => ({}))) as { listingId?: string; sitemap?: boolean };
  if (typeof body.listingId === "string") revalidateTag(tagForListing(body.listingId), "max");
  if (body.sitemap) revalidateTag(TAG_SITEMAP, "max");
  revalidateTag(TAG_PUBLIC, "max");

  return NextResponse.json({ ok: true, revalidated: true });
}
