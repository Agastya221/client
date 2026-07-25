export default function WatchPageLoading() {
  return (
    <main
      className="min-h-screen bg-[#0a0b0c] px-3 pb-12 pt-[76px] text-white sm:px-6"
      aria-label="Loading watch page"
    >
      <section className="mx-auto max-w-[112rem] animate-pulse">
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="space-y-3">
            <div className="relative aspect-video overflow-hidden rounded-2xl border border-white/[0.08] bg-[#101216]">
              <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/65 to-transparent" />
              <div className="absolute bottom-5 left-5 space-y-2">
                <div className="h-4 w-48 rounded bg-white/10" />
                <div className="h-3 w-28 rounded bg-white/[0.06]" />
              </div>
            </div>

            <div className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-[#101216] px-4">
              <div className="flex gap-4">
                <div className="h-4 w-16 rounded bg-white/[0.08]" />
                <div className="h-4 w-16 rounded bg-white/[0.08]" />
                <div className="h-4 w-16 rounded bg-white/[0.08]" />
              </div>
              <div className="h-4 w-24 rounded bg-white/[0.06]" />
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-[#101216] p-4 sm:p-5">
              <div className="mb-4 flex gap-3">
                <div className="h-10 w-28 rounded-xl bg-white/10" />
                <div className="h-10 w-28 rounded-xl bg-white/[0.06]" />
              </div>
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, groupIndex) => (
                  <div
                    key={groupIndex}
                    className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3"
                  >
                    <div className="mb-3 h-3 w-20 rounded bg-white/[0.07]" />
                    <div className="flex flex-wrap gap-2">
                      {Array.from({ length: groupIndex === 0 ? 3 : 2 }).map((__, index) => (
                        <div key={index} className="h-9 w-24 rounded-xl bg-white/[0.07]" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <aside className="rounded-2xl border border-white/[0.08] bg-[#101216] p-3">
            <div className="mb-3 flex items-center justify-between">
              <div className="h-5 w-20 rounded bg-white/10" />
              <div className="h-5 w-8 rounded-full bg-white/[0.06]" />
            </div>
            <div className="mb-3 flex gap-2">
              <div className="h-10 flex-1 rounded-xl bg-white/[0.07]" />
              <div className="h-10 w-10 rounded-xl bg-white/[0.07]" />
            </div>
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="flex h-[74px] items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] p-2"
                >
                  <div className="h-full w-28 shrink-0 rounded-lg bg-white/[0.07]" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-3 w-4/5 rounded bg-white/[0.09]" />
                    <div className="h-3 w-full rounded bg-white/[0.05]" />
                    <div className="h-3 w-2/3 rounded bg-white/[0.05]" />
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
