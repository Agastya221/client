"use client";

import { useSearchParams } from "next/navigation";
import BrowseExperience from "@/components/search/BrowseExperience";
import type { HomeViewMode } from "@/lib/home-view";

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
  const searchParams = useSearchParams();
  const viewParam = searchParams.get("view");
  const mode: HomeViewMode = viewParam === "browse" ? "browse" : viewParam === "home" ? "home" : initialMode;

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
