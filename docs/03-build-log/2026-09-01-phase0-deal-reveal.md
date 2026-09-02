# Phase 0 deal reveal foundation

Date: 2026-09-01

## Scope

Implemented the current-product portion of PRD Slice 7: permissioned deal preparation, EN/JA review, evidence-backed activation, automatic expiration, an emergency kill path, public localized offer display, and server-validated reveal measurement. Vendor self-service, billing entitlements, unique one-time codes, affiliate modules, and the `/today` editorial surface remain separate roadmap work.

## Product contract

- Staff create a scheduled offer against an existing listing and may mark it sponsored.
- EN and JA copy must both pass locale review before activation.
- Activation requires an approved private evidence document representing vendor permission.
- Public reads include only active, in-window deals with published copy for that locale; reveal codes never enter the public listing DTO or page HTML.
- Reveals are ungated, rate-limited, validated server-side, and counted once per deal/session. The admin surface uses the required wording “code reveals (estimated offer interest)” and does not claim redemption.
- Expired reveals return HTTP 410 and, when enabled in the configuration registry, a bounded list of active localized alternatives.
- The scheduled maintenance route activates scheduled deals and expires elapsed deals. The kill action immediately invalidates public content.

## Security and data handling

- Deal tables have RLS enabled and no direct browser mutations; privileged writes use guarded functions and MFA-backed admin actions.
- Reveal codes are redacted from audit snapshots and visible in the admin queue only to editor/publisher/super-admin roles.
- The operational reveal ledger is not readable by browser roles and is excluded from generic audit payloads.
- The canonical `deal_reveal` event is recorded server-side only on the first reveal for a deal/session.

## Verification

- Clean local replay of every database migration.
- TypeScript and lint checks passed.
- Unit suite: 262 tests passed.
- Database/security suite: 346 tests passed.
- Browser suite: 57 scenarios passed, covering desktop, mobile, accessibility, EN/JA typography, server-rendered offer copy, and JavaScript-disabled public pages.
