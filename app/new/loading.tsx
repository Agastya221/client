export default function Loading() {
  return (
    <main className="min-h-screen bg-[#0a0b0c] text-white pt-24 pb-16 px-4 lg:px-12 xl:px-16">
      <div className="mb-10 animate-pulse">
        <div className="h-3 w-20 rounded bg-white/5 mb-3" />
        <div className="h-9 w-64 rounded-lg bg-white/5 mb-2" />
        <div className="h-4 w-48 rounded bg-white/5" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-4 gap-y-8">
        {Array.from({ length: 24 }).map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="aspect-[2/3] rounded-xl bg-white/5" />
            <div className="mt-2 h-4 w-3/4 rounded bg-white/5" />
            <div className="mt-1 h-3 w-1/2 rounded bg-white/5" />
          </div>
        ))}
      </div>
    </main>
  );
}
