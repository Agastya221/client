"use client";

import { useCallback, useEffect, useState } from "react";
import BrowseExperience from "@/components/search/BrowseExperience";
import { HOME_VIEW_EVENT, type HomeViewMode } from "@/lib/home-view";

function readHomeView(): HomeViewMode {
  if (typeof window === "undefined") return "home";
  return new URLSearchParams(window.location.search).get("view") === "browse" ? "browse" : "home";
}

export default function HomeBrowseShell({
  initialMode,
  hero,
  genres,
  children,
}: {
  initialMode: HomeViewMode;
  hero: React.ReactNode;
  genres: string[];
  children: React.ReactNode;
}) {
  const [mode, setMode] = useState<HomeViewMode>(initialMode);

  const changeMode = useCallback((nextMode: HomeViewMode) => {
    setMode(nextMode);
  }, []);

  useEffect(() => {
    const handleViewChange = (event: Event) => {
      const nextMode = (event as CustomEvent<{ mode?: HomeViewMode }>).detail?.mode;
      changeMode(nextMode === "browse" ? "browse" : "home");
    };
    const handlePopState = () => changeMode(readHomeView());

    window.addEventListener(HOME_VIEW_EVENT, handleViewChange);
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener(HOME_VIEW_EVENT, handleViewChange);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [changeMode]);

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
