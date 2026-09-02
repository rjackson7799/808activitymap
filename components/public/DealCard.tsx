"use client";

import { useState } from "react";
import { Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DealDTO } from "@/lib/public-read/dto";
import type { Locale } from "@/lib/locales";

interface DealCardLabels {
  reveal: string;
  revealing: string;
  code: string;
  unavailable: string;
  sponsored: string;
}

export function DealCard({ deal, locale, expiresLabel, labels }: { deal: DealDTO; locale: Locale; expiresLabel: string; labels: DealCardLabels }) {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function reveal() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/deals/${deal.id}/reveal`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      if (!response.ok) {
        setError(labels.unavailable);
        return;
      }
      const payload = await response.json() as { code?: string };
      if (!payload.code) setError(labels.unavailable);
      else setCode(payload.code);
    } catch {
      setError(labels.unavailable);
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="rounded-card border border-terracotta/25 bg-clay-light/35 p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-terracotta text-white"><Ticket size={17} aria-hidden /></span>
        <div className="min-w-0">
          {deal.sponsored ? <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-terracotta-deep">{labels.sponsored}</p> : null}
          <h3 className="text-base font-bold text-ink">{deal.title}</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-secondary">{deal.terms}</p>
          <p className="mt-2 text-xs font-semibold text-terracotta-deep">{expiresLabel}</p>
        </div>
      </div>
      <div className="mt-4">
        {code ? (
          <div role="status" className="rounded-field border border-success/20 bg-success-bg p-4">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-success">{labels.code}</p>
            <p className="mt-1 break-all font-mono text-xl font-bold text-ink">{code}</p>
          </div>
        ) : (
          <Button type="button" variant="cta" size="md" onClick={reveal} disabled={pending}>
            {pending ? labels.revealing : labels.reveal}
          </Button>
        )}
        {error ? <p role="alert" className="mt-3 text-sm font-semibold text-error">{error}</p> : null}
      </div>
    </article>
  );
}
