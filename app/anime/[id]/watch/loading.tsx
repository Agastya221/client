import { Loader2 } from "lucide-react";
import Navbar from "@/components/ui/Navbar";
import SiteFooter from "@/components/ui/SiteFooter";

export default function WatchLoading() {
  return (
    <main className="min-h-screen bg-surface text-on-surface flex flex-col">
      <Navbar />

      <section className="relative overflow-hidden px-4 pb-12 pt-10 sm:px-6 flex-1">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,94,94,0.18),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.04),transparent_22%)] border-t border-white/5" />
        <div className="relative mx-auto max-w-[96rem] animate-pulse">
          {/* Breadcrumb Skeleton */}
          <div className="mb-6 flex items-center gap-2">
            <div className="h-4 w-12 rounded bg-white/10" />
            <div className="h-3 w-3 rounded bg-white/5" />
            <div className="h-4 w-40 rounded bg-white/10" />
            <div className="h-3 w-3 rounded bg-white/5" />
            <div className="h-6 w-24 rounded-full bg-[#ff5500]/10 border border-[#ff5500]/25" />
          </div>

          <div className="flex flex-col lg:flex-row gap-6">
            {/* Main Player Skeleton */}
            <div className="flex-1 space-y-6">
              <div className="aspect-video w-full rounded-2xl bg-[#161616] border border-white/10 shadow-2xl flex flex-col items-center justify-center gap-4">
                <Loader2 className="w-12 h-12 text-[#ff5500] animate-spin" />
                <p className="text-white/50 text-xs font-bold uppercase tracking-widest">
                  CONNECTING TO SERVERS...
                </p>
              </div>

              {/* Server Select Skeleton */}
              <div className="rounded-xl bg-[#161618] border border-white/10 p-4">
                <div className="flex gap-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-9 w-24 rounded-full bg-white/10"
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Right Sidebar Skeleton */}
            <aside className="w-full lg:w-[24rem] space-y-5">
              <div className="rounded-[1.75rem] bg-[#161616] border border-white/10 p-5">
                <div className="flex gap-4">
                  <div className="h-24 w-16 shrink-0 rounded-lg bg-white/10" />
                  <div className="flex-1 space-y-2">
                    <div className="h-5 w-3/4 rounded bg-white/10" />
                    <div className="h-3 w-1/2 rounded bg-white/5" />
                    <div className="h-3 w-2/3 rounded bg-white/5" />
                  </div>
                </div>
              </div>
              <div className="rounded-[1.75rem] bg-[#161616] border border-white/10 p-5">
                <div className="h-3 w-20 rounded bg-white/10 mb-4" />
                <div className="space-y-3">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 rounded-lg border border-white/5 bg-[#222] p-3"
                    >
                      <div className="h-5 w-16 rounded bg-white/10" />
                      <div className="h-4 flex-1 rounded bg-white/5" />
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
