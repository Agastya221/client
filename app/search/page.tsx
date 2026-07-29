import { Suspense } from "react";
import type { Metadata } from "next";
import { getAnilistGenres } from "@/lib/anilist/api";
import SearchClient from "@/components/search/SearchClient";
import Navbar from "@/components/ui/Navbar";
import SiteFooter from "@/components/ui/SiteFooter";
import Loading from "./loading";

function firstParam(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v[0] || "" : v || "";
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const query = await searchParams;
  const search = firstParam(query.q || query.search || query.keyword);
  const genre = firstParam(query.genre);
  const sort = firstParam(query.sort);

  const title = genre
    ? `${genre} Anime | Yorumi`
    : search
    ? `Search: ${search} | Yorumi`
    : sort === "trending"
    ? "Trending Anime | Yorumi"
    : sort === "season"
    ? "This Season | Yorumi"
    : "Browse Anime | Yorumi";

  return {
    title,
    description: genre
      ? `Browse the best ${genre} anime on Yorumi. HD streaming with multi-provider fallback.`
      : search
      ? `Search results for "${search}" on Yorumi.`
      : "Browse and search anime on Yorumi.",
  };
}

/**
 * Search page — server renders Navbar/SiteFooter, client fetches results.
 * Navbar/SiteFooter stay server-side so their auth/db imports never reach the browser.
 */
export default async function SearchPage() {
  const genres = await getAnilistGenres().catch(() => [] as string[]);

  return (
    <main className="min-h-screen bg-[#0a0b0c] text-white">
      {/* The same Browse experience is also available as a direct, shareable route. */}
      <Suspense fallback={<Loading />}>
        <SearchClient genres={genres} />
      </Suspense>
      <SiteFooter />
    </main>
  );
}
