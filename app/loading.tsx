export default function RootLoading() {
  return (
    <main className="min-h-screen bg-[#0a0b0c] text-white" aria-label="Loading page">
      <div className="fixed inset-x-0 top-0 z-50 h-[70px] border-b border-white/[0.07] bg-[#0a0b0c]/95 px-4 sm:px-8">
        <div className="mx-auto flex h-full max-w-[112rem] items-center justify-between">
          <div className="h-8 w-36 rounded-lg bg-white/10" />
          <div className="hidden h-10 w-72 rounded-full bg-white/[0.06] sm:block" />
          <div className="h-10 w-24 rounded-full bg-white/[0.06]" />
        </div>
      </div>

      <div className="animate-pulse px-3 pb-12 pt-[82px] sm:px-6 lg:px-12">
        <section className="relative mx-auto aspect-[16/7] max-w-[112rem] overflow-hidden rounded-2xl border border-white/[0.07] bg-[#101216]">
          <div className="absolute inset-0 bg-[linear-gradient(110deg,transparent,rgba(255,255,255,0.035),transparent)]" />
          <div className="absolute bottom-8 left-6 space-y-4 sm:bottom-12 sm:left-10">
            <div className="h-5 w-28 rounded-full bg-white/10" />
            <div className="h-10 w-64 rounded-lg bg-white/10 sm:w-96" />
            <div className="h-4 w-56 rounded bg-white/[0.06] sm:w-[32rem]" />
            <div className="flex gap-3">
              <div className="h-11 w-32 rounded-full bg-white/10" />
              <div className="h-11 w-28 rounded-full bg-white/[0.06]" />
            </div>
          </div>
        </section>

        <section className="mx-auto mt-8 max-w-[112rem] rounded-2xl border border-white/[0.07] bg-[#0f1012] p-4 sm:p-5">
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
