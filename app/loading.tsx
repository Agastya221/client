export default function RootLoading() {
  return (
    <main className="min-h-screen bg-[#0a0b0c] pt-16 text-white" aria-label="Loading page">
      <div className="animate-pulse">
        <section className="relative min-h-[calc(100svh-4rem)] overflow-hidden bg-[#101216]">
          <div className="absolute inset-0 bg-[linear-gradient(110deg,transparent,rgba(255,255,255,0.035),transparent)]" />
          <div className="absolute bottom-16 left-6 space-y-4 sm:bottom-24 sm:left-12 lg:left-20">
            <div className="h-5 w-28 rounded-full bg-white/10" />
            <div className="h-10 w-64 rounded-lg bg-white/10 sm:w-96" />
            <div className="h-4 w-56 rounded bg-white/[0.06] sm:w-[32rem]" />
            <div className="flex gap-3">
              <div className="h-11 w-32 rounded-full bg-white/10" />
              <div className="h-11 w-28 rounded-full bg-white/[0.06]" />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[112rem] p-4 py-10 sm:p-6 lg:px-12">
          <div className="mb-5 h-7 w-40 rounded bg-white/10" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
            {Array.from({ length: 12 }).map((_, index) => (
              <div key={index} className="space-y-3">
                <div className="aspect-[2/3] rounded-xl bg-white/[0.07]" />
                <div className="h-4 w-4/5 rounded bg-white/[0.07]" />
                <div className="h-3 w-1/2 rounded bg-white/[0.04]" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
