import type { Conjunct, GrantSpec, Model, PolicySpec } from "./model";
import { OP_ORDER, type Op } from "./semantics";

/**
 * Deterministic SQL rendering: stable ordering (model is pre-sorted), LF
 * only, no timestamps/environment in the body — byte-identical output on
 * Windows dev boxes and the Linux CI runner is what makes the drift gate
 * (`rls:generate` + git diff) trustworthy.
 *
 * Shape rules (ADR-003):
 *  - ONE permissive policy per (table, op), named {table}_{op}: a stray or
 *    hand-written policy ORing into the set is structurally impossible to
 *    miss — the inventory test compares pg_policies against the manifest
 *    exactly. Hand-written policies must NEVER match the {table}_{op} name
 *    pattern or the drop-preamble will remove them.
 *  - Each conjunct is self-contained: (role check AND aal check AND row
 *    predicate) — an aal2-free reviewer branch can never widen an editor
 *    branch, because the role check lives inside the conjunct.
 *  - (select …) wrapping makes helpers InitPlans (evaluated once per
 *    statement — the standard Supabase RLS performance shape).
 *  - UPDATE renders USING and WITH CHECK explicitly (WITH CHECK is what
 *    stops a ja reviewer re-assigning a row to locale='ko').
 */

const HEADER = `-- GENERATED FILE — DO NOT EDIT.
-- Source: db/rls/matrix.ts (PRD §4 contract) ∧ db/rls/availability.ts
-- (slice mask), rendered by db/rls/generate.ts.
--
-- Regenerate:            npm run rls:generate
-- Post-ship changes:     bump OUTPUT_MIGRATION in db/rls/config.ts — a NEW
--                        file is generated (self-contained: drops all
--                        generated policies, recreates full state); shipped
--                        generated migrations are never edited.
-- Hand-written policies: must never be named {table}_{op} — the
--                        drop-preamble below removes any policy matching
--                        that pattern.
`;

const DROP_PREAMBLE = `-- Drop every previously generated policy (discovery-based: no knowledge of
-- the prior version needed; self-contained full state follows).
do $$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and policyname ~ '^[a-z0-9_]+_(select|insert|update|delete)$'
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;
`;

function renderRow(row: NonNullable<Conjunct["row"]>): string {
  switch (row.kind) {
    case "locale":
      return `locale = '${row.locale}'`;
    case "ownRows":
      return `${row.actorColumn} = (select auth.uid())`;
  }
}

function renderConjunct(c: Conjunct): string {
  const parts = [
    `(select public.is_platform(array[${c.roles.map((r) => `'${r}'`).join(", ")}]))`,
  ];
  if (c.aal2) parts.push(`(select public.jwt_aal()) = 'aal2'`);
  if (c.row) parts.push(renderRow(c.row));
  return `(${parts.join(" and ")})`;
}

function renderExpression(conjuncts: Conjunct[]): string {
  return conjuncts.map(renderConjunct).join("\n    or ");
}

function renderPolicy(p: PolicySpec): string {
  const expr = renderExpression(p.conjuncts);
  const lines = [`create policy ${p.name} on public.${p.table}`];
  switch (p.op) {
    case "select":
    case "delete":
      lines.push(`  for ${p.op} to authenticated`, `  using (`, `    ${expr}`, `  );`);
      break;
    case "insert":
      lines.push(`  for insert to authenticated`, `  with check (`, `    ${expr}`, `  );`);
      break;
    case "update":
      lines.push(
        `  for update to authenticated`,
        `  using (`,
        `    ${expr}`,
        `  )`,
        `  with check (`,
        `    ${expr}`,
        `  );`,
      );
      break;
  }
  return lines.join("\n");
}

function renderGrant(g: GrantSpec): string {
  const lines: string[] = [`revoke all on table public.${g.table} from authenticated;`];
  const fullOps = OP_ORDER.filter((op) => g.ops[op] === "full");
  const columnOps = OP_ORDER.filter((op) => g.ops[op] === "columns");
  if (fullOps.length > 0) {
    lines.push(`grant ${fullOps.join(", ")} on table public.${g.table} to authenticated;`);
  }
  if (columnOps.length > 0) {
    const excluded = (g.protectedColumns ?? [])
      .map((c) => `'${c}'`)
      .sort()
      .join(", ");
    const grantList = columnOps.map((op) => `${op} (%1$s)`).join(", ");
    lines.push(
      `do $$  -- ${columnOps.join("/")} grants exclude fn-owned columns: ${(g.protectedColumns ?? []).join(", ")}`,
      `declare cols text;`,
      `begin`,
      `  select string_agg(quote_ident(column_name), ', ' order by column_name) into cols`,
      `  from information_schema.columns`,
      `  where table_schema = 'public' and table_name = '${g.table}'`,
      `    and column_name not in (${excluded});`,
      `  execute format('grant ${grantList} on table public.${g.table} to authenticated', cols);`,
      `end $$;`,
    );
  }
  return lines.join("\n");
}

export function renderMigration(model: Model): string {
  const sections: string[] = [HEADER, DROP_PREAMBLE];

  const tables = [...new Set(model.grants.map((g) => g.table))];
  for (const table of tables) {
    const bar = "─".repeat(Math.max(1, 68 - table.length));
    sections.push(`-- ── ${table} ${bar}`);
    for (const p of model.policies.filter((p) => p.table === table)) {
      sections.push(renderPolicy(p));
    }
    const grant = model.grants.find((g) => g.table === table)!;
    sections.push(renderGrant(grant));
  }

  return sections.join("\n\n") + "\n";
}

/** The inventory the model-driven suite compares pg_policies against. */
export function manifest(model: Model): Array<{ table: string; op: Op; name: string }> {
  return model.policies.map((p) => ({ table: p.table, op: p.op, name: p.name }));
}
