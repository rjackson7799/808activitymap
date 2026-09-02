import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { AuthzError, STAFF_ROLES } from "@/lib/auth/claims";
import { requireRole } from "@/lib/auth/require-role";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { ActivateForm, CreateDealForm, KillForm, LocaleForm, ReviewForm } from "./DealForms";
import { AffiliateLinkStatusForm, CreateAffiliateLinkForm } from "./AffiliateForms";

type DealLocaleRow = { id: string; locale: "en"|"ja"|"ko"; status: string; title: string; terms: string; reviewed_at: string|null };
type DealRow = { id: string; listing_id: string; listing_name: string; status: string; reveal_code: string; sponsor_label: boolean; reveal_count: number; starts_at: string; expires_at: string; approval_evidence_media_id: string|null; locales: DealLocaleRow[] };
type AffiliateLinkRow = { id:string; listing_id:string; listing_name:string; partner_key:string; partner_name:string; destination_url:string; context:string; status:string; sort_order:number; consecutive_failures:number; last_checked_at:string|null; last_http_status:number|null };

const CREATE_ROLES = ["super_admin", "publisher", "editor", "ops_agent"] as const;
const MANAGE_ROLES = ["super_admin", "publisher", "editor"] as const;

export default async function DealsPage() {
  let claims;
  try { claims = await requireRole(STAFF_ROLES, { aal2: true }); }
  catch (error) {
    if (error instanceof AuthzError) redirect(error.reason === "aal2_required" ? "/login/mfa" : "/login");
    throw error;
  }
  const db = await createSupabaseServerClient();
  const canCreate = claims.appRoles.some((r) => CREATE_ROLES.includes(r as typeof CREATE_ROLES[number]));
  const canManage = claims.appRoles.some((r) => MANAGE_ROLES.includes(r as typeof MANAGE_ROLES[number]));
  const [dealResult, listingResult, evidenceResult, affiliateResult] = await Promise.all([
    db.rpc("list_admin_deals"),
    canCreate ? db.from("listings").select("id, listing_locales(locale,name)").order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    canManage ? db.from("media").select("id,path").eq("bucket", "evidence").eq("kind", "evidence").eq("moderation_status", "approved").order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    canManage ? db.rpc("list_admin_affiliate_links") : Promise.resolve({ data: [], error: null }),
  ]);
  const deals = (dealResult.data ?? []) as unknown as DealRow[];
  const listings = ((listingResult.data ?? []) as unknown as Array<{id:string;listing_locales:Array<{locale:string;name:string|null}>}>).map((l)=>({id:l.id,name:l.listing_locales.find((x)=>x.locale==="en")?.name ?? l.id}));
  const evidence = (evidenceResult.data ?? []) as Array<{id:string;path:string}>;
  const affiliateLinks = (affiliateResult.data ?? []) as unknown as AffiliateLinkRow[];
  const error = dealResult.error ?? listingResult.error ?? evidenceResult.error ?? affiliateResult.error;
  const active = deals.filter((d)=>d.status==="active").length;
  const awaiting = deals.filter((d)=>d.status==="requested").length;

  return <div className="space-y-8">
    <header className="max-w-3xl"><p className="eyebrow mb-3">Offers</p><h1 className="font-serif text-4xl leading-tight text-ink sm:text-5xl">Deals</h1><p className="mt-4 text-base leading-7 text-secondary">Prepare permissioned, localized offers and control exactly when they appear. Code reveals measure estimated interest—not redemption.</p></header>
    {!error && deals.length>0 ? <section aria-label="Deal summary" className="grid gap-3 sm:grid-cols-3"><Metric label="Awaiting preparation" value={awaiting}/><Metric label="Live now" value={active}/><Metric label="All offers" value={deals.length}/></section>:null}
    {canCreate ? <section aria-labelledby="create-deal-heading" className="rounded-card border border-hairline-strong bg-white p-5 shadow-card sm:p-6"><h2 id="create-deal-heading" className="text-xl font-bold text-ink">Create offer draft</h2><p className="mb-5 mt-1 text-sm text-secondary">Times use Hawaii Standard Time. A draft cannot go live until EN and JA wording pass review and approved vendor evidence is attached.</p><CreateDealForm listings={listings}/></section>:null}
    {error ? <p role="alert" className="rounded-field border border-error/20 bg-error-bg p-4 text-sm text-error">Couldn&apos;t load deals: {error.message}</p>:null}
    {!error && deals.length===0 ? <div className="rounded-card border border-dashed border-hairline-strong bg-white p-8 text-center shadow-card"><h2 className="text-lg font-bold text-ink">No offers yet</h2><p className="mt-2 text-sm text-secondary">Create the first permissioned offer when vendor terms are ready.</p></div>:null}
    {!error && deals.length>0 ? <section aria-labelledby="deal-queue-heading"><h2 id="deal-queue-heading" className="mb-4 text-xl font-bold text-ink">Offer workflow</h2><div className="grid gap-5">{deals.map((deal)=><DealCard key={deal.id} deal={deal} evidence={evidence} roles={claims.appRoles} canManage={canManage}/>)}</div></section>:null}
    {canManage ? <section aria-labelledby="affiliate-heading" className="space-y-5 border-t border-hairline pt-8"><header className="max-w-3xl"><p className="eyebrow mb-2">Tracked recommendations</p><h2 id="affiliate-heading" className="font-serif text-3xl text-ink">Affiliate links</h2><p className="mt-2 text-sm leading-6 text-secondary">Curate clearly disclosed partner links for existing listing pages. Destinations are measured through a first-party redirect and checked weekly.</p></header><div className="rounded-card border border-hairline-strong bg-white p-5 shadow-card sm:p-6"><h3 className="text-lg font-bold text-ink">Add tracked link</h3><p className="mb-5 mt-1 text-sm text-secondary">Use the partner’s final HTTPS tracking URL. Private network addresses are blocked.</p><CreateAffiliateLinkForm listings={listings}/></div>{affiliateLinks.length===0?<div className="rounded-card border border-dashed border-hairline-strong bg-white p-7 text-center"><h3 className="font-bold text-ink">No affiliate links yet</h3><p className="mt-2 text-sm text-secondary">Public listing pages omit this module until a link is added.</p></div>:<div className="grid gap-4">{affiliateLinks.map((link)=><article key={link.id} className="rounded-card border border-hairline-strong bg-white p-5 shadow-card"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold text-ink">{link.partner_name}</h3><p className="mt-1 text-sm text-secondary">{link.listing_name} · {humanize(link.context)} · order {link.sort_order}</p></div><Badge variant={link.status==="active"?"verified":link.status==="dead"?"error":"neutral"}>{humanize(link.status)}</Badge></div><p className="mt-3 break-all text-xs text-muted">{link.destination_url}</p><p className="mt-2 text-xs text-muted">Health: {link.last_checked_at ? `${link.last_http_status ?? "network error"} · ${link.consecutive_failures} consecutive failures` : "not checked yet"}</p><div className="mt-4"><AffiliateLinkStatusForm id={link.id} status={link.status}/></div></article>)}</div>}</section>:null}
  </div>;
}

function DealCard({deal,evidence,roles,canManage}:{deal:DealRow;evidence:Array<{id:string;path:string}>;roles:readonly string[];canManage:boolean}) {
  const editable=deal.status==="requested"&&canManage;
  const localeMap=new Map(deal.locales.map((l)=>[l.locale,l]));
  const ready=["en","ja"].every((l)=>localeMap.get(l as "en"|"ja")?.status==="qa_approved") && deal.locales.every((l)=>l.status==="qa_approved");
  return <article className="overflow-hidden rounded-card border border-hairline-strong bg-white shadow-card">
    <div className="border-b border-hairline bg-neutral/45 px-5 py-4 sm:px-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-bold text-ink">{deal.listing_name}</h3><p className="mt-1 text-sm text-secondary">{formatDate(deal.starts_at)} – {formatDate(deal.expires_at)}</p></div><Badge variant={deal.status==="active"?"verified":deal.status==="killed"?"error":"neutral"}>{humanize(deal.status)}</Badge></div><p className="mt-3 text-xs text-muted">{deal.sponsor_label ? "Sponsored · " : ""}Code reveals (estimated offer interest): <span className="font-semibold text-ink">{deal.reveal_count}</span>{canManage?<> · Reveal code: <span className="font-mono font-semibold text-ink">{deal.reveal_code}</span></>:null}</p></div>
    <div className="space-y-5 p-5 sm:p-6">
      {editable ? <div className="grid gap-4 lg:grid-cols-2"><LocaleForm dealId={deal.id} locale="en" value={localeMap.get("en")}/><LocaleForm dealId={deal.id} locale="ja" value={localeMap.get("ja")}/></div>:null}
      {deal.locales.map((locale)=>{const review=locale.status==="qa_pending"&&canReview(roles,locale.locale);return <div key={locale.id} className="rounded-field border border-hairline p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-secondary">{locale.locale}</p><p className="mt-1 font-bold text-ink">{locale.title}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-secondary">{locale.terms}</p></div><Badge variant={locale.status==="published"||locale.status==="qa_approved"?"verified":"neutral"}>{humanize(locale.status)}</Badge></div>{review?<div className="mt-4"><ReviewForm id={locale.id}/></div>:null}</div>})}
      {deal.status==="requested"&&canManage ? <div className="border-t border-hairline pt-5">{ready?<ActivateForm dealId={deal.id} evidence={evidence}/>:<p className="text-sm text-secondary">EN and JA wording must both be QA approved before activation.</p>}</div>:null}
      {["approved","active","expired"].includes(deal.status)&&canManage?<div className="border-t border-hairline pt-5"><KillForm dealId={deal.id}/></div>:null}
    </div>
  </article>;
}

function canReview(roles:readonly string[],locale:string){return roles.includes("super_admin")||roles.includes("publisher")||(locale==="en"&&roles.includes("editor"))||(locale==="ja"&&roles.includes("language_reviewer_ja"))||(locale==="ko"&&roles.includes("language_reviewer_ko"));}
function Metric({label,value}:{label:string;value:number}){return <div className="rounded-card border border-hairline-strong bg-white p-5 shadow-card"><p className="text-sm font-medium text-secondary">{label}</p><p className="mt-2 font-serif text-3xl text-ink">{value}</p></div>}
function humanize(value:string){return value.replaceAll("_"," ").replace(/\b\w/g,(c)=>c.toUpperCase())}
function formatDate(value:string){return new Intl.DateTimeFormat("en-US",{dateStyle:"medium",timeStyle:"short",timeZone:"Pacific/Honolulu"}).format(new Date(value))}
