"use client";

import { usePathname, useSearchParams } from "next/navigation";
import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type LoaderKind = "none" | "detail" | "watch";

type NavigationPendingContextValue = {
  isNavigationPending: boolean;
  beginNavigation: (href: string) => boolean;
};

const NavigationPendingContext = createContext<NavigationPendingContextValue | null>(null);

function loaderKindForPath(pathname: string): LoaderKind {
  if (/\/(watch|player)\//.test(pathname) || /^\/anime\/[^/]+\/watch\/?$/.test(pathname)) return "watch";
  if (/^\/anime\/[^/]+\/?$/.test(pathname)) return "detail";
  return "none";
}

function isModifiedClick(event: MouseEvent): boolean {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

function SearchCommitObserver({ onCommit }: { onCommit: () => void }) {
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const committedSearchRef = useRef(search);

  useEffect(() => {
    if (committedSearchRef.current === search) return;
    committedSearchRef.current = search;
    onCommit();
  }, [onCommit, search]);

  return null;
}

export default function NavigationPendingController({
  children,
  detailLoader,
  watchLoader,
}: {
  children: ReactNode;
  detailLoader: ReactNode;
  watchLoader: ReactNode;
}) {
  const pathname = usePathname();
  const committedPathRef = useRef(pathname);
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [loaderKind, setLoaderKind] = useState<LoaderKind>("none");

  const beginNavigation = useCallback((href: string) => {
    const destination = new URL(href, window.location.href);
    const current = new URL(window.location.href);
    if (destination.origin !== current.origin) return false;
    if (destination.pathname === current.pathname && destination.search === current.search) return false;
    if (pendingRef.current) return false;

    const kind = loaderKindForPath(destination.pathname);
    if (kind === "none") {
      return true;
    }

    pendingRef.current = true;
    setLoaderKind(kind);
    setPending(true);
    return true;
  }, []);

  const finishNavigation = useCallback(() => {
    pendingRef.current = false;
    setPending(false);
  }, []);

  useEffect(() => {
    if (committedPathRef.current === pathname) return;
    committedPathRef.current = pathname;
    const timer = window.setTimeout(finishNavigation, 0);
    return () => window.clearTimeout(timer);
  }, [finishNavigation, pathname]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || isModifiedClick(event)) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      if (anchor.dataset.homeView && destination.pathname === window.location.pathname) return;
      if (destination.pathname === window.location.pathname && destination.search === window.location.search) return;

      if (pendingRef.current) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      beginNavigation(destination.href);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [beginNavigation]);

  const value = useMemo(() => ({
    isNavigationPending: pending,
    beginNavigation,
  }), [beginNavigation, pending]);

  const activeLoader = loaderKind === "watch"
    ? watchLoader
    : loaderKind === "detail"
      ? detailLoader
      : null;

  return (
    <NavigationPendingContext.Provider value={value}>
      <Suspense fallback={null}>
        <SearchCommitObserver onCommit={finishNavigation} />
      </Suspense>
      {children}
      {pending && activeLoader ? (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-[#0a0b0c]" aria-busy="true">
          {activeLoader}
        </div>
      ) : null}
    </NavigationPendingContext.Provider>
  );
}

export function useNavigationPending(): NavigationPendingContextValue {
  const context = useContext(NavigationPendingContext);
  if (!context) throw new Error("useNavigationPending must be used inside NavigationPendingController");
  return context;
}
