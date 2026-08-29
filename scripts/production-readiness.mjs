import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const evidencePath = path.resolve(process.argv[2] ?? "config/production-readiness.json");
const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
const checks = [];

function check(name, passed, detail) {
  checks.push({ name, passed: Boolean(passed), detail });
}

function isFinalDomain(value) {
  if (typeof value !== "string" || value.length === 0) return false;
  return !/(localhost|vercel\.app|example\.|tbd|portal)/i.test(value);
}

function isRecentRestoreDrill(value) {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(timestamp)) return false;
  const ageDays = (Date.now() - timestamp) / 86_400_000;
  return ageDays >= 0 && ageDays <= 92;
}

const { brand, content, people, publicTrust, infrastructure, reliability, performance } = evidence;

check(
  "Final brand and domain",
  brand.approved && brand.name && isFinalDomain(brand.domain),
  brand.approved ? `${brand.name} / ${brand.domain}` : "D27 approval is missing",
);
check(
  "Permissioned launch inventory",
  content.permissionedListings >= 25 && content.permissionedListings <= 40,
  `${content.permissionedListings}/25–40 listings`,
);
check(
  "EN and JA publication coverage",
  content.publishedByLocale.en === content.permissionedListings &&
    content.publishedByLocale.ja === content.permissionedListings,
  `EN ${content.publishedByLocale.en}, JA ${content.publishedByLocale.ja}, inventory ${content.permissionedListings}`,
);
check(
  "KO launch coverage",
  content.foundingVendorKoCoveragePercent === 100 &&
    content.seededListingKoMenuCoveragePercent >= 70 &&
    content.publishedByLocale.ko > 0,
  `founding ${content.foundingVendorKoCoveragePercent}%, seeded menus ${content.seededListingKoMenuCoveragePercent}%, published ${content.publishedByLocale.ko}`,
);
check(
  "Required publication staffing",
  people.koReviewerConfirmed && people.koReviewerBackupConfirmed && people.backupPublisherConfirmed,
  "KO reviewer, KO backup, and backup publisher must all be confirmed",
);
check(
  "Trust and correction surfaces",
  publicTrust.trustPageVerified && publicTrust.reportChangeFlowVerified,
  "trust page and report-a-change flow",
);
check("llms.txt", publicTrust.llmsTxtVerified, "requires the approved brand/domain");
check(
  "Production infrastructure",
  infrastructure.productionVercelVerified &&
    infrastructure.productionSupabaseVerified &&
    infrastructure.productionSecretsVerified &&
    infrastructure.domainDnsVerified,
  "Vercel, Supabase, secrets, and DNS must be independently verified",
);
check(
  "Repository deployment protections",
  infrastructure.branchProtectionVerified && infrastructure.environmentProtectionVerified,
  "main branch and production environment protections",
);
check(
  "Backup and restore controls",
  reliability.dailyBackupsVerified &&
    reliability.pitrPlanVerified &&
    isRecentRestoreDrill(reliability.restoreDrillDate),
  `daily backups, PITR, restore drill ${reliability.restoreDrillDate ?? "not recorded"}`,
);
check(
  "Monitoring and rollback",
  reliability.monitoringVerified && reliability.rollbackVerified,
  "error, uptime, field-CWV monitoring and rollback rehearsal",
);
check(
  "Reference-listing performance",
  performance.referenceListingVerified &&
    performance.lighthousePerformance >= 0.9 &&
    performance.lighthouseAccessibility >= 0.9 &&
    performance.lighthouseBestPractices >= 0.9 &&
    performance.lcpMs <= 2_500 &&
    performance.pageWeightBytes <= 500 * 1024 &&
    content.referenceListingPhotoCount >= 6,
  `reference=${performance.referenceListingVerified}, photos=${content.referenceListingPhotoCount}, LCP=${performance.lcpMs}ms, bytes=${performance.pageWeightBytes}`,
);

console.log(`Production readiness evidence: ${evidencePath}`);
console.log(`Last audited: ${evidence.lastAuditedAt}`);
for (const item of checks) {
  console.log(`${item.passed ? "PASS" : "BLOCKED"}  ${item.name} — ${item.detail}`);
}

const blocked = checks.filter((item) => !item.passed);
console.log(`\n${checks.length - blocked.length}/${checks.length} launch gates passed.`);
if (blocked.length > 0) {
  console.error(`Production release is BLOCKED by ${blocked.length} gate(s).`);
  process.exitCode = 1;
} else {
  console.log("Production release evidence is complete. Deployment still requires explicit approval.");
}
