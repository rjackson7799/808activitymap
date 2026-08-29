/** Serialize JSON-LD without allowing user-authored text to close the script tag. */
export function serializeJsonLd(node: Record<string, unknown>): string {
  return JSON.stringify(node).replace(/</g, "\\u003c");
}
