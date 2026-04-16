export default function SiteFooter() {
  return (
    <footer className="border-t border-outline-variant/20 bg-surface-container-lowest px-6 py-12">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <p className="text-lg font-black tracking-tight text-primary">
            KAIDO<span className="text-on-surface">.</span>
          </p>
          <p className="max-w-xl text-sm text-on-surface-variant">
            Pure anime streaming with provider fallback powered by HiAnime, AnimeKai, and DesiDub.
          </p>
        </div>
        <div className="flex flex-wrap gap-6 text-xs font-semibold uppercase tracking-[0.24em] text-on-surface-variant">
          <span>Anime only</span>
          <span>Fallback ready</span>
          <span>Proxy playback</span>
        </div>
      </div>
    </footer>
  );
}
