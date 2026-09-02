import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { AuthzError, STAFF_ROLES } from "@/lib/auth/claims";
import { requireRole } from "@/lib/auth/require-role";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { ArchiveEditionForm, CreateEditionForm, EditionLocaleForm, EditionReviewForm, PublishEditionForm, ShortlistForm } from "./TodayForms";

type LocaleRow = { id:string; locale:"en"|"ja"|"ko"; status:string; title:string; dek:string; body:string; reviewed_at:string|null };
type ItemRow = { listing_id:string; listing_name:string; position:number };
type EditionRow = { id:string; week_of:string; status:string; published_at:string|null; locales:LocaleRow[]; items:ItemRow[] };

export default async function TodayAdminPage() {
  let claims;
  try { claims = await requireRole(STAFF_ROLES, { aal2: true }); }
  catch (error) {
    if (error instanceof AuthzError) redirect(error.reason === "aal2_required" ? "/login/mfa" : "/login");
    throw error;
  }
  const db = await createSupabaseServerClient();
  const canDraft = claims.appRoles.some((role) => ["super_admin","publisher","editor"].includes(role));
  const canPublish = claims.appRoles.some((role) => ["super_admin","publisher"].includes(role));
  const [editionResult, listingResult] = await Promise.all([
    db.rpc("list_admin_today_editions"),
    canDraft ? db.from("listings").select("id,listing_locales(locale,name)").eq("publication_status","published").order("created_at") : Promise.resolve({data:[],error:null}),
  ]);
  const editions = (editionResult.data ?? []) as unknown as EditionRow[];
  const listings = ((listingResult.data ?? []) as unknown as Array<{id:string;listing_locales:Array<{locale:string;name:string|null}>}>).map((listing)=>({id:listing.id,name:listing.listing_locales.find((row)=>row.locale==="en")?.name ?? listing.id}));
  const error = editionResult.error ?? listingResult.error;

  return <div className="space-y-8">
    <header className="max-w-3xl"><p className="eyebrow mb-3">Weekly editorial</p><h1 className="font-serif text-4xl leading-tight text-ink sm:text-5xl">This week</h1><p className="mt-4 text-base leading-7 text-secondary">Prepare one timely local note and a compact shortlist. EN and JA copy must pass review before a publisher can release it.</p></header>
    {canDraft ? <section aria-labelledby="create-edition-heading" className="rounded-card border border-hairline-strong bg-white p-5 shadow-card sm:p-6"><h2 id="create-edition-heading" className="text-xl font-bold text-ink">Start an edition</h2><p className="mb-5 mt-1 text-sm text-secondary">Use the Monday that begins the issue week. Future issues can be drafted but cannot publish early.</p><CreateEditionForm/></section>:null}
    {error ? <p role="alert" className="rounded-field border border-error/20 bg-error-bg p-4 text-sm text-error">Couldn&apos;t load weekly editions: {error.message}</p>:null}
    {!error && editions.length===0 ? <div className="rounded-card border border-dashed border-hairline-strong bg-white p-8 text-center shadow-card"><h2 className="text-lg font-bold text-ink">No editions yet</h2><p className="mt-2 text-sm text-secondary">Create the first weekly note when the editorial copy is ready.</p></div>:null}
    <section aria-labelledby="edition-queue-heading"><h2 id="edition-queue-heading" className="mb-4 text-xl font-bold text-ink">Edition workflow</h2><div className="grid gap-5">{editions.map((edition)=><EditionCard key={edition.id} edition={edition} listings={listings} roles={claims.appRoles} canDraft={canDraft} canPublish={canPublish}/>)}</div></section>
  </div>;
}

function EditionCard({edition,listings,roles,canDraft,canPublish}:{edition:EditionRow;listings:Array<{id:string;name:string}>;roles:readonly string[];canDraft:boolean;canPublish:boolean}) {
  const draft=edition.status==="draft";
  const localeMap=new Map(edition.locales.map((locale)=>[locale.locale,locale]));
  const ready=["en","ja"].every((locale)=>localeMap.get(locale as "en"|"ja")?.status==="qa_approved")&&edition.locales.every((locale)=>locale.status==="qa_approved")&&edition.items.length>0;
  return <article className="overflow-hidden rounded-card border border-hairline-strong bg-white shadow-card">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-hairline bg-neutral/45 px-5 py-4 sm:px-6"><div><h3 className="text-lg font-bold text-ink">Week of {formatDate(edition.week_of)}</h3><p className="mt-1 text-sm text-secondary">{edition.items.length} shortlisted {edition.items.length===1?"place":"places"}{edition.published_at?` · published ${formatDate(edition.published_at)}`:""}</p></div><Badge variant={edition.status==="published"?"verified":"neutral"}>{humanize(edition.status)}</Badge></div>
    <div className="space-y-5 p-5 sm:p-6">
      {draft&&canDraft?<div className="grid gap-4 lg:grid-cols-2">{(["en","ja"] as const).filter((locale)=>canEdit(roles,locale)).map((locale)=><EditionLocaleForm key={locale} editionId={edition.id} locale={locale} value={localeMap.get(locale)}/>)}</div>:null}
      {edition.locales.map((locale)=><div key={locale.id} className="rounded-field border border-hairline p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wider text-secondary">{locale.locale}</p><p className="mt-1 font-bold text-ink">{locale.title}</p><p className="mt-1 text-sm leading-6 text-secondary">{locale.dek}</p><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-body">{locale.body}</p></div><Badge variant={["qa_approved","published"].includes(locale.status)?"verified":"neutral"}>{humanize(locale.status)}</Badge></div>{draft&&locale.status==="qa_pending"&&canEdit(roles,locale.locale)?<div className="mt-4"><EditionReviewForm id={locale.id}/></div>:null}</div>)}
      {draft&&canDraft?<div className="border-t border-hairline pt-5"><ShortlistForm editionId={edition.id} listings={listings} selected={edition.items.map((item)=>item.listing_id)}/></div>:null}
      {draft&&canPublish?<div className="border-t border-hairline pt-5">{ready?<PublishEditionForm editionId={edition.id}/>:<p className="text-sm text-secondary">Approved EN and JA copy plus at least one shortlist place are required before publication.</p>}</div>:null}
      {edition.status==="published"&&canPublish?<div className="border-t border-hairline pt-5"><ArchiveEditionForm editionId={edition.id}/></div>:null}
    </div>
  </article>;
}

function canEdit(roles:readonly string[],locale:string){return roles.includes("super_admin")||roles.includes("publisher")||(locale==="en"&&roles.includes("editor"))||(locale==="ja"&&roles.includes("language_reviewer_ja"))||(locale==="ko"&&roles.includes("language_reviewer_ko"));}
function humanize(value:string){return value.replaceAll("_"," ").replace(/\b\w/g,(character)=>character.toUpperCase())}
function formatDate(value:string){return new Intl.DateTimeFormat("en-US",{dateStyle:"medium",timeZone:"Pacific/Honolulu"}).format(new Date(value.length===10?`${value}T12:00:00-10:00`:value))}
