import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { APP_CONFIG_REGISTRY } from "@/config/app-config";
import { AuthzError, STAFF_ROLES } from "@/lib/auth/claims";
import { requireRole } from "@/lib/auth/require-role";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { canReviewLocale, queueAgeHours, summarizeQaQueue, type QaLocale, type QaQueueItem } from "@/lib/language-qa/admin";
import { fetchLanguageQaQueue } from "@/lib/language-qa/read";
import { ListingTranslationForm, MenuItemForm, MenuSectionForm, WorkControls } from "./QaForms";

export default async function LanguageQaPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  if (rawLocale !== "ja" && rawLocale !== "ko") notFound();
  const locale = rawLocale as QaLocale;
  let claims;
  try { claims = await requireRole(STAFF_ROLES, { aal2: true }); }
  catch (error) { if (error instanceof AuthzError) redirect(error.reason === "aal2_required" ? "/login/mfa" : "/login"); throw error; }
  const supabase = await createSupabaseServerClient();
  const [{ items, error }, configResult] = await Promise.all([
    fetchLanguageQaQueue(supabase, locale),
    supabase.from("app_config").select("value").eq("key", "queue_sla_targets_hours").maybeSingle(),
  ]);
  const parsed = APP_CONFIG_REGISTRY.queue_sla_targets_hours.schema.safeParse(configResult.data?.value);
  const targets = parsed.success ? parsed.data : APP_CONFIG_REGISTRY.queue_sla_targets_hours.devDefault;
  const slaHours = targets[`qa_${locale}`];
  const canReview = canReviewLocale(claims.appRoles, locale);
  const now = new Date();
  const summary = summarizeQaQueue(items, slaHours, now);
  const language = locale === "ja" ? "Japanese" : "Korean";

  return <div className="space-y-8">
    <header className="max-w-3xl">
      <p className="eyebrow mb-3">Translation quality</p>
      <h1 className="font-serif text-4xl leading-tight text-ink sm:text-5xl">{language} QA queue</h1>
      <p className="mt-4 text-base leading-7 text-secondary">Review localized listing copy and menus against their English or source material. Machine drafts remain private until a qualified reviewer approves them.</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Link href="/admin/qa/ja" className={buttonVariants({ variant: locale === "ja" ? "primary" : "outline", size: "sm" })}>Japanese queue</Link>
        <Link href="/admin/qa/ko" className={buttonVariants({ variant: locale === "ko" ? "primary" : "outline", size: "sm" })}>Korean queue</Link>
      </div>
    </header>

    {!error && !configResult.error ? <section aria-label="QA queue summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Metric label="Pending" value={summary.pending} /><Metric label="Unassigned" value={summary.unassigned} alert={summary.unassigned > 0} />
      <Metric label="Active now" value={summary.active} /><Metric label="Past SLA" value={summary.overSla} alert={summary.overSla > 0} />
      <Metric label="Oldest age" value={`${summary.oldestHours}h`} alert={summary.oldestHours > slaHours} />
    </section> : null}

    <div className={`rounded-field border p-4 text-sm leading-6 ${canReview ? "border-success/15 bg-success-bg text-success" : "border-hairline-strong bg-neutral text-secondary"}`}>
      <p className="font-bold">{canReview ? `${language} review enabled` : "Queue monitoring only"}</p>
      <p className="mt-1">SLA target: {slaHours} hours. {canReview ? "Claim one item, start its timer, save corrections, then approve or return it for rework." : "Only the matching language reviewer, publisher, or super-admin can change this queue."}</p>
    </div>

    {error || configResult.error ? <p role="alert" className="rounded-field border border-error/20 bg-error-bg p-4 text-sm text-error">Couldn&apos;t load the QA queue: {error?.message ?? configResult.error?.message}</p> : null}
    {!error && !configResult.error && items.length === 0 ? <div className="rounded-card border border-dashed border-hairline-strong bg-white p-8 text-center shadow-card"><h2 className="text-lg font-bold text-ink">Queue clear</h2><p className="mt-2 text-sm text-secondary">No {language.toLowerCase()} listing or menu translations are awaiting QA.</p></div> : null}
    {!error && !configResult.error && items.length > 0 ? <section aria-labelledby="queue-heading">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h2 id="queue-heading" className="text-xl font-bold text-ink">Review work</h2><p className="mt-1 text-sm text-secondary">Unassigned items appear first, oldest first.</p></div><Badge variant="neutral">Phase 0 · human QA</Badge></div>
      <div className="grid gap-6">{items.map((item) => <QaCard key={`${item.type}-${item.id}`} item={item} now={now} slaHours={slaHours} currentUser={claims.sub} canReview={canReview} />)}</div>
    </section> : null}
  </div>;
}

function QaCard({ item, now, slaHours, currentUser, canReview }: { item: QaQueueItem; now: Date; slaHours: number; currentUser: string; canReview: boolean }) {
  const age = queueAgeHours(item, now); const overdue = age > slaHours;
  return <article className={`overflow-hidden rounded-card border bg-white shadow-card ${overdue ? "border-warning/40" : "border-hairline-strong"}`}>
    <div className="border-b border-hairline bg-neutral/45 px-5 py-4 sm:px-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-bold text-ink">{item.listingName}</h3><p className="mt-1 text-sm text-secondary">{item.type === "listing_locale" ? "Listing page" : `Menu version ${item.menu?.version}`} · waiting {age}h</p></div><div className="flex flex-wrap gap-2"><Badge variant={overdue ? "stale" : "info"}>{overdue ? "Past SLA" : "QA pending"}</Badge><Badge variant={item.assignment ? "neutral" : "error"}>{item.assignment ? "Assigned" : "Unassigned"}</Badge></div></div></div>
    <div className="space-y-6 p-5 sm:p-6">
      <dl className="grid gap-4 rounded-field border border-hairline bg-shell p-4 sm:grid-cols-3"><Detail label="Assignee" value={item.assignment?.assignedTo ?? "Unassigned"} /><Detail label="Active time" value={`${item.assignment?.activeMinutes.toFixed(2) ?? "0.00"} min`} /><Detail label="Timer" value={item.assignment?.activeSessionId ? "Running" : "Paused"} /></dl>
      {item.listing ? <div className="grid gap-5 lg:grid-cols-2"><SourcePanel title="QA-approved English reference" rows={item.listing.source ? [["Name",item.listing.source.name],["Slug",item.listing.source.slug],["SEO title",item.listing.source.seoTitle],["SEO description",item.listing.source.seoDescription],["Editorial note",item.listing.source.editorialNote]] : [["Reference","No English reference available"]]} /><div className="rounded-field border border-hairline-strong p-4"><h4 className="mb-4 font-bold text-ink">{item.locale.toUpperCase()} translation</h4><ListingTranslationForm locale={item.locale} id={item.id} value={item.listing.translation} /></div></div> : null}
      {item.menu ? <div className="grid gap-5 lg:grid-cols-[minmax(16rem,0.75fr)_minmax(0,1.5fr)]"><div className="rounded-field border border-hairline-strong bg-shell p-4"><h4 className="font-bold text-ink">Source menu</h4><p className="mt-2 break-all text-sm text-secondary">{item.menu.sourcePath}</p>{item.menu.sourceUrl ? <a href={item.menu.sourceUrl} target="_blank" rel="noreferrer" className={`${buttonVariants({ variant: "outline", size: "sm" })} mt-4`}>Open private source</a> : <p className="mt-4 text-sm text-muted">The source file is recorded but not available in this environment.</p>}</div><div className="space-y-5">{item.menu.sections.map((section) => <section key={section.id} className="rounded-field border border-hairline-strong p-4"><p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">English section: {section.sourceName ?? "—"}</p><MenuSectionForm locale={item.locale} sectionId={section.id} name={section.name} /><div className="mt-5 space-y-4">{section.items.map((menuItem) => <div key={menuItem.id} className="rounded-field bg-neutral/55 p-4"><div className="mb-4 flex flex-wrap justify-between gap-2"><div><p className="font-bold text-ink">{menuItem.sourceName ?? "Unnamed source item"}</p><p className="text-sm text-secondary">{formatPrice(menuItem.priceCents, menuItem.currency, menuItem.priceType)}</p></div><Badge variant={menuItem.humanConfirmed ? "verified" : "stale"}>{menuItem.humanConfirmed ? "Human confirmed" : "Confirmation required"}</Badge></div><MenuItemForm locale={item.locale} item={menuItem} /></div>)}</div></section>)}</div></div> : null}
      <div className="border-t border-hairline pt-5"><WorkControls locale={item.locale} type={item.type} id={item.id} listingId={item.listingId} assignedTo={item.assignment?.assignedTo ?? null} activeActor={item.assignment?.activeActor ?? null} currentUser={currentUser} canReview={canReview} /></div>
    </div>
  </article>;
}

function Metric({ label, value, alert=false }: { label: string; value: number | string; alert?: boolean }) { return <div className={`rounded-card border bg-white p-5 shadow-card ${alert ? "border-warning/30" : "border-hairline-strong"}`}><p className="text-sm font-medium text-secondary">{label}</p><p className={`mt-2 font-serif text-3xl ${alert ? "text-terracotta-deep" : "text-ink"}`}>{value}</p></div>; }
function Detail({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-bold uppercase tracking-wider text-muted">{label}</dt><dd className="mt-1 break-all text-sm text-ink">{value}</dd></div>; }
function SourcePanel({ title, rows }: { title: string; rows: Array<[string,string | null]> }) { return <div className="rounded-field border border-hairline-strong bg-shell p-4"><h4 className="mb-4 font-bold text-ink">{title}</h4><dl className="space-y-4">{rows.map(([label,value]) => <Detail key={label} label={label} value={value ?? "—"} />)}</dl></div>; }
function formatPrice(cents: number | null, currency: string, type: string) { if (type === "market") return "Market price"; if (cents === null) return "No price recorded"; return `${type === "from" ? "From " : ""}${new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents/100)}`; }
