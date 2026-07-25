export default function Loading() {
  return (
    <main className="min-h-screen bg-[#0a0b0c] text-white">
      {/* Hero skeleton */}
      <section className="border-b border-white/5 px-6 pb-14 pt-28">
        <div className="mx-auto max-w-7xl animate-pulse space-y-6">
          <div className="flex gap-3">
            <div className="h-6 w-28 rounded-full bg-white/5" />
            <div className="h-6 w-16 rounded-full bg-white/5" />
          </div>
          <div className="h-16 w-2/3 rounded-xl bg-white/[0.07]" />
          <div className="h-5 w-96 rounded bg-white/5" />
        </div>
      </section>

      {/* Featured genre cards skeleton */}
      <section className="px-6 py-12">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 animate-pulse space-y-2">
            <div className="h-3 w-28 rounded bg-white/5" />
            <div className="h-8 w-64 rounded-lg bg-white/[0.07]" />
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-44 animate-pulse rounded-2xl bg-white/[0.04]" style={{ animationDelay: `${i * 50}ms` }} />
            ))}
          </div>
        </div>
      </section>

      {/* Tag cloud skeleton */}
      <section className="px-6 pb-16">
        <div className="mx-auto max-w-7xl rounded-2xl border border-white/5 bg-white/[0.02] p-6">
          <div className="mb-6 animate-pulse space-y-2">
            <div className="h-3 w-20 rounded bg-white/5" />
            <div className="h-7 w-48 rounded-lg bg-white/[0.07]" />
          </div>
          <div className="flex flex-wrap gap-2.5">
            {Array.from({ length: 30 }).map((_, i) => (
              <div
                key={i}
                className="h-9 animate-pulse rounded-full bg-white/[0.04]"
                style={{ width: `${60 + (i % 5) * 20}px`, animationDelay: `${i * 20}ms` }}
              />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
