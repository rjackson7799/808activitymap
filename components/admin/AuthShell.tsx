import type { ReactNode } from "react";

type AuthShellProps = {
  children: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  wide?: boolean;
};

/** Shared, public-facing shell for the staff authentication journey. */
export function AuthShell({ children, eyebrow, title, description, wide = false }: AuthShellProps) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10 sm:px-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 top-12 h-64 w-64 rounded-full bg-teal/10 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 bottom-0 h-72 w-72 rounded-full bg-gold/20 blur-3xl"
      />

      <section
        aria-labelledby="auth-title"
        className={`relative w-full rounded-card border border-hairline-strong bg-shell p-6 shadow-lift sm:p-8 ${
          wide ? "max-w-xl" : "max-w-md"
        }`}
      >
        <header className="mb-7">
          <p className="eyebrow mb-3">{eyebrow}</p>
          <h1 id="auth-title" className="font-serif text-3xl leading-tight text-ink sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 max-w-prose text-sm leading-6 text-secondary">{description}</p>
        </header>

        {children}
      </section>
    </main>
  );
}

export const authInputClassName =
  "mt-2 min-h-12 w-full rounded-field border border-hairline-strong bg-white px-3.5 py-2.5 text-base text-ink shadow-sm placeholder:text-muted focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20 disabled:cursor-not-allowed disabled:bg-neutral disabled:text-muted";

