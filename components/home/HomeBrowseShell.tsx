"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import BrowseExperience from "@/components/search/BrowseExperience";
import type { HomeViewMode } from "@/lib/home-view";

interface HomeBrowseShellProps {
  initialMode: HomeViewMode;
  hero: React.ReactNode;
  genres: string[];
  children: React.ReactNode;
}

/**
 * The homepage is served from a cached, pre-rendered copy, so the server cannot know
 * whether the URL asks for `?view=browse`. The Suspense fallback is what goes into the
 * cached HTML (the normal home view); in the browser the search-params-aware version
 * takes over and switches to browse mode when the URL asks for it.
 */
export default function HomeBrowseShell(props: HomeBrowseShellProps) {
  return (
    <Suspense fallback={<HomeBrowseView {...props} mode={props.initialMode} />}>
      <HomeBrowseShellWithParams {...props} />
    </Suspense>
  );
}

function HomeBrowseShellWithParams(props: HomeBrowseShellProps) {
  const searchParams = useSearchParams();
  const viewParam = searchParams.get("view");
  const mode: HomeViewMode = viewParam === "browse" ? "browse" : viewParam === "home" ? "home" : props.initialMode;
  return <HomeBrowseView {...props} mode={mode} />;
}

function HomeBrowseView({
  mode,
  hero,
  genres,
  children,
}: HomeBrowseShellProps & { mode: HomeViewMode }) {
  return (
    <div data-home-view={mode} className="relative overflow-clip">
      <div
        className={`relative overflow-hidden bg-[#080809] transition-[height,opacity,filter] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          mode === "home"
            ? "h-[clamp(570px,155vw,640px)] opacity-100 lg:h-[100svh]"
            : "h-16 opacity-0 brightness-50"
        }`}
        aria-hidden={mode === "browse"}
        inert={mode === "browse" ? true : undefined}
      >
        {hero}
      </div>

      {mode === "home" ? (
        <div className="home-state-enter">{children}</div>
      ) : (
        <div className="browse-state-enter">
          <BrowseExperience genres={genres} />
        </div>
      )}
    </div>
  );
}
