"use client";

import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-2xl py-8 sm:py-14">
      <div className="rounded-card border border-error/20 bg-white p-6 text-center shadow-card sm:p-9">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-error-bg font-serif text-xl text-error" aria-hidden>!</span>
        <p className="eyebrow mt-5">Admin recovery</p>
        <h1 className="mt-3 font-serif text-3xl leading-tight text-ink sm:text-4xl">Something went wrong</h1>
        <p className="mx-auto mt-4 max-w-lg text-sm leading-7 text-secondary">
          The admin workspace couldn&apos;t complete this request. Try again, or return to the dashboard.
        </p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Button type="button" onClick={reset} className="min-h-11">
            <RotateCcw size={16} aria-hidden />
            Try again
          </Button>
          <Link href="/admin" className={buttonVariants({ variant: "outline", size: "md" })}>
            Return to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
