-- Phase 0 business-interest intake. This is deliberately not a claim,
-- organization membership, subscription, or vendor-account record.

create table public.business_inquiries (
  id uuid primary key default gen_random_uuid(),
  market_id text not null references public.markets(id) on delete restrict,
  source_locale text not null constraint business_inquiries_locale_check check (source_locale in ('en', 'ja', 'ko')),
  business_name text not null constraint business_inquiries_business_name_length check (char_length(business_name) between 1 and 160),
  contact_name text not null constraint business_inquiries_contact_name_length check (char_length(contact_name) between 1 and 100),
  email text not null constraint business_inquiries_email_length check (char_length(email) between 3 and 320),
  phone text constraint business_inquiries_phone_length check (phone is null or char_length(phone) <= 40),
  website text constraint business_inquiries_website_length check (website is null or char_length(website) <= 500),
  message text not null constraint business_inquiries_message_length check (char_length(message) between 20 and 2000),
  preferred_language text not null constraint business_inquiries_preferred_language_check check (preferred_language in ('en', 'ja')),
  consent_at timestamptz not null default now(),
  consent_version text not null default 'business-inquiry-v1',
  status text not null default 'open' constraint business_inquiries_status_check check (status in ('open', 'contacted', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index business_inquiries_queue_idx
  on public.business_inquiries (status, created_at);

alter table public.business_inquiries enable row level security;
revoke all on table public.business_inquiries from anon, authenticated;

create trigger business_inquiries_updated_at
  before update on public.business_inquiries
  for each row execute function public.set_updated_at();

create trigger audit_business_inquiries
  after insert or update or delete on public.business_inquiries
  for each row execute function public.write_audit();

comment on table public.business_inquiries is
  'Phase 0 public interest intake; server-only, not a claim or portal account.';

insert into public.app_config (key, value, description) values
  ('business_inquiry_rate_limits', '{"per_ip":4,"per_session":2}',
   'Fixed-window rate limits for public business-interest intake')
on conflict (key) do nothing;
