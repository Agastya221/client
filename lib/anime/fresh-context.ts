import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Marks a stream refresh (player error / "Refresh source"): every call to the Render API made
 * while resolving it carries `?fresh=1`, so Render skips its own 3-hour copy of the watch result.
 * Without this, refreshing a dead link would just be handed the same dead link back.
 */
export const freshContext = new AsyncLocalStorage<{ fresh: boolean }>();

export const isFreshRequest = (): boolean => freshContext.getStore()?.fresh === true;

/** Adds fresh=1 to a Render API path while a refresh is running. */
export function withFreshParam(path: string): string {
  if (!isFreshRequest() || /[?&]fresh=1(?:&|$)/.test(path)) return path;
  return `${path}${path.includes("?") ? "&" : "?"}fresh=1`;
}
