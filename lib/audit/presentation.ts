export type AuditSnapshot = Record<string, unknown> | null;

export function humanizeAuditValue(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function changedAuditFields(before: AuditSnapshot, after: AuditSnapshot) {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);

  return [...keys]
    .filter((key) => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]))
    .sort((left, right) => left.localeCompare(right));
}

export function formatAuditSnapshot(snapshot: AuditSnapshot) {
  return snapshot ? JSON.stringify(snapshot, null, 2) : "Not applicable";
}

export function formatAuditTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Pacific/Honolulu",
  }).format(new Date(value));
}
