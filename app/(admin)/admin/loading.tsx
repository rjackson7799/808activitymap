const workspacePlaceholders = Array.from({ length: 3 }, (_, index) => index);

/** Keeps authenticated route transitions visually anchored inside the admin shell. */
export default function AdminLoading() {
  return (
    <div aria-busy="true" className="animate-pulse space-y-8">
      <p role="status" className="sr-only">
        Loading workspace…
      </p>

      <header aria-hidden="true" className="max-w-3xl">
        <div className="h-2.5 w-24 rounded-full bg-terracotta/20" />
        <div className="mt-5 h-11 w-full max-w-md rounded-field bg-neutral sm:h-14" />
        <div className="mt-5 h-3.5 w-full max-w-2xl rounded-full bg-neutral" />
        <div className="mt-2.5 h-3.5 w-2/3 max-w-lg rounded-full bg-neutral" />
      </header>

      <section aria-hidden="true">
        <div className="mb-5 h-5 w-28 rounded-full bg-neutral" />
        <div className="grid gap-4 md:grid-cols-3">
          {workspacePlaceholders.map((index) => (
            <div
              key={index}
              className="min-h-44 rounded-card border border-hairline-strong bg-white p-5 shadow-card"
            >
              <div className="size-10 rounded-cta bg-info-bg" />
              <div className="mt-6 h-5 w-28 rounded-full bg-neutral" />
              <div className="mt-4 h-3 w-full rounded-full bg-field" />
              <div className="mt-2 h-3 w-4/5 rounded-full bg-field" />
            </div>
          ))}
        </div>
      </section>

      <section
        aria-hidden="true"
        className="rounded-card border border-hairline-strong bg-white p-5 shadow-card sm:p-6"
      >
        <div className="h-4 w-36 rounded-full bg-success-bg" />
        <div className="mt-5 h-3.5 w-full max-w-sm rounded-full bg-neutral" />
        <div className="mt-3 h-3 w-full max-w-md rounded-full bg-field" />
      </section>
    </div>
  );
}
