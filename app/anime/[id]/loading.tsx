import { Loader2 } from "lucide-react";
import Navbar from "@/components/ui/Navbar";
import SiteFooter from "@/components/ui/SiteFooter";

export default function AnimeDetailLoading() {
  return (
    <main className="min-h-screen bg-[#121212] flex flex-col">
      <Navbar />

      <div className="flex-1 animate-pulse">
        {/* Hero Section Skeleton */}
        <section className="relative overflow-hidden pb-14 pt-24">
          <div className="absolute inset-0 bg-gradient-to-b from-[#1a1a1a] to-[#121212]" />
          <div className="relative mx-auto max-w-7xl px-6">
            <div className="grid gap-10 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-end">
              {/* Poster Skeleton */}
              <div className="hidden lg:block">
                <div className="aspect-[2/3] w-full rounded-[1.75rem] border border-white/10 bg-[#161616] shadow-2xl" />
              </div>

              {/* Info Skeleton */}
              <div className="space-y-6 py-12">
                {/* Badges */}
                <div className="flex gap-3">
                  <div className="h-6 w-24 rounded-full bg-white/10" />
                  <div className="h-6 w-16 rounded-full bg-white/10" />
                  <div className="h-6 w-16 rounded-full bg-white/10" />
                </div>

                {/* Title & Description */}
                <div className="space-y-4">
                  <div className="h-14 w-3/4 rounded-lg bg-white/10" />
                  <div className="space-y-2">
                    <div className="h-4 w-full rounded bg-white/5" />
                    <div className="h-4 w-5/6 rounded bg-white/5" />
                    <div className="h-4 w-2/3 rounded bg-white/5" />
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-4 pt-4">
                  <div className="h-12 w-40 rounded-full bg-[#ff5500]/20 flex items-center justify-center border border-[#ff5500]/50">
                    <Loader2 className="w-5 h-5 text-[#ff5500] animate-spin" />
                  </div>
                  <div className="h-12 w-48 rounded-full bg-white/10" />
                </div>

                {/* Provider Buttons */}
                <div className="flex gap-3">
                  <div className="h-9 w-20 rounded-full bg-white/10" />
                  <div className="h-9 w-24 rounded-full bg-white/10" />
                  <div className="h-9 w-20 rounded-full bg-white/10" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Content Section Skeleton */}
        <section className="px-6 py-10 bg-[#121212]">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="space-y-8">
              {/* Metadata Cards */}
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="rounded-[1.5rem] border border-white/5 bg-[#1a1a1a] p-5 shadow-lg"
                  >
                    <div className="h-3 w-16 rounded bg-white/10" />
                    <div className="mt-3 h-5 w-2/3 rounded bg-white/10" />
                  </div>
                ))}
              </div>

              {/* Episode Section Skeleton */}
              <div className="rounded-[1.75rem] border border-white/5 bg-[#1a1a1a] p-6 shadow-lg">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="h-3 w-20 rounded bg-white/10" />
                    <div className="mt-3 h-9 w-64 rounded bg-white/10" />
                  </div>
                  <div className="h-8 w-36 rounded-full bg-white/10" />
                </div>
                <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className="rounded-[1.5rem] border border-white/5 bg-[#222] p-4"
                    >
                      <div className="h-3 w-24 rounded bg-white/10" />
                      <div className="mt-3 h-5 w-3/4 rounded bg-white/10" />
                      <div className="mt-4 flex gap-2">
                        <div className="h-6 w-16 rounded-full bg-white/10" />
                        <div className="h-6 w-16 rounded-full bg-white/10" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Sidebar Skeleton */}
            <aside className="space-y-8">
              <div className="rounded-[1.75rem] border border-white/5 bg-[#1a1a1a] p-5 shadow-lg">
                <div className="h-3 w-28 rounded bg-white/10" />
                <div className="mt-5 space-y-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex gap-3 rounded-xl border border-white/5 bg-[#222] p-3"
                    >
                      <div className="h-20 w-14 shrink-0 rounded-lg bg-white/10" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-3/4 rounded bg-white/10" />
                        <div className="h-3 w-1/2 rounded bg-white/5" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
