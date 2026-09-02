export interface OrderableAffiliateLink {
  partnerKey: string;
  sortOrder: number;
}

/** Configured partner keys lead; unconfigured modules retain staff sort order. */
export function orderAffiliateLinks<T extends OrderableAffiliateLink>(links: readonly T[], ordering: readonly string[]): T[] {
  const rank = new Map(ordering.map((key, index) => [key, index]));
  return [...links].sort((a, b) =>
    (rank.get(a.partnerKey) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.partnerKey) ?? Number.MAX_SAFE_INTEGER) ||
    a.sortOrder - b.sortOrder ||
    a.partnerKey.localeCompare(b.partnerKey),
  );
}
