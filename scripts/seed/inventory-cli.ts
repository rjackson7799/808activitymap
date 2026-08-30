import { auditInventory, readInventoryDirectory } from "./inventory";

function main(): void {
  const args = process.argv.slice(2);
  const directory = args.find((arg) => !arg.startsWith("--"));
  if (!directory) throw new Error("Usage: npm run seed:inventory -- <dossier-directory>");

  const report = auditInventory(readInventoryDirectory(directory));
  if (args.includes("--json")) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`Launch inventory audit — ${report.directory}`);
    console.log(`Dossiers ${report.filesScanned}/${report.target.min}–${report.target.max} · valid ${report.validDossiers} · confirmed ${report.confirmed} · photos ${report.withPhotos} · JA ${report.withJapanese} · KO ${report.withKorean}`);
    if (report.ready) console.log("READY  offline dossier inventory meets the intake contract");
    else for (const issue of report.issues) console.log(`BLOCKED  ${issue.code}${issue.external_ref ? ` [${issue.external_ref}]` : ""} — ${issue.detail}${issue.path ? ` (${issue.path})` : ""}`);
  }
  process.exit(report.ready ? 0 : 2);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
