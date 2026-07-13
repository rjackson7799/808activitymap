/**
 * Public read-model cache tags (CP4). Shared vocabulary between the cached read layer
 * (server.ts) and the admin publish/unpublish actions that invalidate it. Pure constants
 * — no server-only import — so either side can use them.
 */
export const TAG_PUBLIC = "public";
export const TAG_SITEMAP = "sitemap";
export const tagForListing = (id: string) => `listing:${id}`;
