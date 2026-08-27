"use client";

import { useState } from "react";
import { emit } from "@/lib/analytics/client";

/**
 * Share control (CP5). Progressive enhancement: uses the native Web Share
 * sheet where available, else copies the current URL to the clipboard. Emits
 * share_click{method} with the method actually used. Rendered as a real
 * <button> — with JS off it is simply inert (share is an enhancement, never
 * core content, so the JS-free pass is unaffected).
 */
export function ShareButton({
  title,
  listingId,
  locale,
  label,
  copiedLabel,
}: {
  title: string;
  listingId: string;
  locale: string;
  label: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);

  const onShare = async () => {
    const url = window.location.href;
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        emit("share_click", { listingId, locale, props: { method: "native" } });
      } catch {
        // user dismissed the share sheet — no event
      }
      return;
    }
    try {
      await navigator.clipboard?.writeText(url);
      setCopied(true);
      emit("share_click", { listingId, locale, props: { method: "copy" } });
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked — nothing to do
    }
  };

  return (
    <button
      type="button"
      onClick={onShare}
      className="rounded-chip border border-hairline px-3 py-1 text-[12px] font-medium text-ink hover:bg-neutral"
    >
      {copied ? copiedLabel : label}
    </button>
  );
}
