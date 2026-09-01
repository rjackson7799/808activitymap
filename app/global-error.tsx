"use client";

import "@/app/globals.css";
import { fontVariables } from "@/app/fonts";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en" className={fontVariables}>
      <head>
        <title>Something went wrong</title>
      </head>
      <body className="bg-[#eee7d9] text-[#3b4149] antialiased">
        <main className="grid min-h-dvh place-items-center px-4 py-12">
          <div className="w-full max-w-xl rounded-[18px] border border-black/15 bg-white p-8 text-center shadow-sm">
            <p className="font-serif text-5xl leading-none text-[#b23b3b]" aria-hidden>!</p>
            <h1 className="mt-5 font-serif text-3xl leading-tight text-[#1e232b]">Something went wrong</h1>
            <p className="mt-4 text-sm leading-7">The page couldn&apos;t load. Please try again.</p>
            <button
              type="button"
              onClick={reset}
              className="mt-7 min-h-11 rounded-[14px] bg-[#1e232b] px-5 text-sm font-bold text-white"
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
