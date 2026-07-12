import { mapDbError } from "./errors";

/**
 * Screen view-state selectors (CP3). Admin screens render distinct empty AND
 * error states per screen (TSD P1-2); these pure functions decide which,
 * turning `(data, error)` from a server-side query into a discriminated state
 * the page renders off. Keeping the decision pure lets the branches be
 * unit-tested without a React harness.
 */

export type ViewState<T> =
  | { kind: "error"; message: string; notFound?: boolean }
  | { kind: "empty" }
  | { kind: "ok"; data: T };

/** Detail screens never render "empty" — an absent row is an error/not-found. */
export type ItemViewState<T> =
  | { kind: "error"; message: string; notFound?: boolean }
  | { kind: "ok"; data: T };

/** List screens: error > empty (zero rows) > ok. */
export function listViewState<T>(data: T[] | null, error: unknown): ViewState<T[]> {
  if (error) return { kind: "error", message: mapDbError(error).message };
  if (!data || data.length === 0) return { kind: "empty" };
  return { kind: "ok", data };
}

/** Detail screens: error > not-found (absent row) > ok. */
export function itemViewState<T>(data: T | null, error: unknown): ItemViewState<T> {
  if (error) return { kind: "error", message: mapDbError(error).message };
  if (data === null || data === undefined) {
    return { kind: "error", message: "Not found.", notFound: true };
  }
  return { kind: "ok", data };
}
