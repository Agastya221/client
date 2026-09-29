import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * false during server rendering and hydration, true once the browser has taken over.
 *
 * Cached (force-static) pages are rendered without the request URL, so anything that
 * depends on the query string must use the server's default until hydration and only
 * then switch. Reading the query string straight away would make the first client
 * render disagree with the cached HTML (a hydration mismatch), and wrapping it in
 * Suspense instead makes Next emit the whole subtree twice.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
