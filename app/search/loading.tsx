/**
 * Shown instantly when the search page is fetching (SSR in progress).
 * Matches the exact layout of the search page so there's no jarring layout shift.
 */
export default function Loading() {
  return (
    <main className="min-h-screen bg-[#0a0b0c] text-white">
      <section className="pt-24 pb-16 px-4 lg:px-12 xl:px-16">
        {/* Header skeleton */}
        <div className="mb-10 animate-pulse">
          <div className="h-3 w-16 rounded bg-white/5 mb-3" />
          <div className="h-9 w-64 rounded-lg bg-white/[0.07] mb-2" />
          <div className="h-4 w-44 rounded bg-white/5" />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[260px_1fr] gap-8">
          {/* Sidebar skeleton */}
          <aside className="space-y-6 animate-pulse">
            <div className="h-11 rounded-xl bg-white/5" />
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-9 rounded-lg bg-white/[0.04]" />
              ))}
            </div>
          </aside>

          {/* Results grid skeleton — exactly matches search page columns */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4 gap-y-8">
            {Array.from({ length: 20 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <div className="aspect-[2/3] rounded-xl bg-white/[0.06]" />
                <div className="mt-2 h-4 w-3/4 rounded bg-white/[0.05]" />
                <div className="mt-1 h-3 w-1/2 rounded bg-white/[0.04]" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
