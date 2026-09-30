import type { Metadata } from "next";
import { Captions, Layers, Lock, MonitorPlay } from "lucide-react";
import InviteForm from "@/components/access/InviteForm";
import PosterWall from "@/components/access/PosterWall";
import YorumiWordmark from "@/components/ui/YorumiWordmark";
import { getShowcaseTitles } from "@/lib/access/showcase";

export const metadata: Metadata = {
  title: "Invite only | Yorumi",
  robots: { index: false, follow: false },
};

// Cached like the other pages: the first thing every visitor sees must load instantly.
// The posters are trending anime; refreshing them a few times a day is plenty.
export const dynamic = "force-static";
export const revalidate = 21600;

const FEATURES = [
  { icon: Captions, title: "Sub & dub", text: "Soft subs, hard subs and dubs, clearly labelled." },
  { icon: Layers, title: "Many servers", text: "Switch servers in a tap; we remember your pick." },
  { icon: MonitorPlay, title: "Made for phones", text: "Fast, clean player that works anywhere." },
];

export default async function InvitePage() {
  const titles = await getShowcaseTitles(28);

  return (
    <main className="relative isolate flex min-h-[100dvh] flex-col overflow-hidden bg-[#0a0b0c] text-white">
      <PosterWall titles={titles} />
      {/* Brand glow: orange from the left, green from the right */}
      <div aria-hidden="true" className="pointer-events-none absolute -left-40 top-1/3 h-[480px] w-[480px] rounded-full bg-[#ff5500]/15 blur-[140px]" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-40 bottom-0 h-[420px] w-[420px] rounded-full bg-[#52ff7f]/10 blur-[140px]" />

      <header className="relative z-10 flex items-center justify-between px-5 pt-6 sm:px-10 lg:px-16">
        <YorumiWordmark className="text-[28px] sm:text-[32px]" />
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-white/65 backdrop-blur-md">
          <Lock className="h-3 w-3" aria-hidden="true" />
          Private beta
        </span>
      </header>

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center gap-10 px-5 py-10 sm:px-10 lg:flex-row lg:items-center lg:gap-16 lg:px-16">
        <section className="access-rise max-w-xl lg:flex-1">
          <p className="mb-4 inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.22em] text-[#52ff7f]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#52ff7f] shadow-[0_0_10px_#52ff7f]" aria-hidden="true" />
            Members only
          </p>
          <h1 className="font-display text-[40px] font-black leading-[1.02] tracking-[-0.03em] sm:text-[56px] lg:text-[64px]">
            Your next binge
            <br />
            <span className="bg-gradient-to-r from-[#ff7a33] via-[#ff5500] to-[#ffb07a] bg-clip-text text-transparent">is waiting.</span>
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/60 sm:text-base">
            YoruMi is a small, invite-only anime community. Enter the code you were given and step inside.
          </p>

          <ul className="mt-8 hidden gap-3 sm:grid sm:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="rounded-2xl border border-white/[0.08] bg-[#111215]/75 p-4 backdrop-blur-md">
                <Icon className="mb-3 h-5 w-5 text-[#ff5500]" aria-hidden="true" />
                <p className="text-sm font-extrabold">{title}</p>
                <p className="mt-1 text-[12px] leading-snug text-white/45">{text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section
          className="access-rise w-full rounded-[28px] border border-white/10 bg-[#111215]/80 p-6 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)] backdrop-blur-2xl sm:p-8 lg:max-w-[420px]"
          style={{ animationDelay: "120ms" }}
        >
          <h2 className="font-display text-2xl font-black tracking-tight">Enter your invite</h2>
          <p className="mb-6 mt-1.5 text-sm text-white/50">One code is all it takes. You&apos;ll stay signed in on this device.</p>
          <InviteForm />
          <div className="mt-6 border-t border-white/[0.07] pt-5 text-center text-[13px] text-white/45">
            No invite yet?{" "}
            <a
              href="https://discord.com/channels/1531000380123643904"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-white/80 underline decoration-white/20 underline-offset-4 transition-colors hover:text-white hover:decoration-[#ff5500]"
            >
              Ask on Discord
            </a>
          </div>
        </section>
      </div>

      <footer className="relative z-10 px-5 pb-6 text-center text-[11px] text-white/25 sm:px-10">
        © {new Date().getFullYear()} YoruMi
      </footer>
    </main>
  );
}
