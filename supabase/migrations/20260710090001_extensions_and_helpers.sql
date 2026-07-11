-- Migration 1: extensions + shared helpers.
-- Enum strategy everywhere: text + named CHECK constraints, not pg enums (ADR-002).

create extension if not exists pgcrypto with schema extensions;

-- Standard updated_at maintenance; attached to every mutable table.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
