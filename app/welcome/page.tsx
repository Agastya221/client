import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowRight, Heart, Layers, LifeBuoy, Smartphone } from "lucide-react";
import PosterWall from "@/components/access/PosterWall";
import YorumiWordmark from "@/components/ui/YorumiWordmark";
import { ACCESS_COOKIE, SHARED_BASE, verifySession } from "@/lib/access/invite";
import { safeNextPath } from "@/lib/access/next-path";
import { routeEnv } from "@/lib/access/route-env";
import { resolveAccessConfig } from "@/lib/access/settings";
import { getShowcaseTitles } from "@/lib/access/showcase";

export const metadata: Metadata = {
  title: "Welcome | Yorumi",
  robots: { index: false, follow: false },
};

const TIPS = [
  { icon: Layers, title: "Sub, dub, your pick", text: "Choose soft subs, hard subs or dub. We remember the server you like for the next episode." },
  { icon: LifeBuoy, title: "Stream acting up?", text: "Tap Change server, or Bug report under the player and we'll look into it." },
  { icon: Smartphone, title: "You stay signed in", text: "Your pass is saved on this device for 60 days. A new phone or browser needs the code again." },
];

/** Who just came in, read from the verified access cookie (never from the URL). */
async function readPass(): Promise<{ kind: "member" | "friends" | "guest"; number: number; of: number }> {
  const env = routeEnv();
  const config = await resolveAccessConfig(env);
  const member = await verifySession(config, (await cookies()).get(ACCESS_COOKIE)?.value);
  if (member === null) return { kind: "guest", number: 0, of: config.maxMembers };
  if (member > SHARED_BASE) return { kind: "friends", number: 0, of: config.maxMembers };
  return { kind: "member", number: member, of: config.maxMembers };
}

export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const [pass, titles, params] = await Promise.all([readPass(), getShowcaseTitles(28), searchParams]);
  const nextParam = Array.isArray(params.next) ? params.next[0] : params.next;
  const next = safeNextPath(nextParam);
  const picks = titles.slice(0, 6);

  const passLabel = pass.kind === "friends" ? "Friends pass" : pass.kind === "member" ? "Member pass" : "Welcome pass";
  const passNumber = pass.kind === "member" ? `No. ${String(pass.number).padStart(3, "0")}` : pass.kind === "friends" ? "Unlimited" : "Guest";

  return (
    <main className="relative isolate min-h-[100dvh] overflow-hidden bg-[#0a0b0c] text-white">
      <PosterWall titles={titles} dim={0.22} />
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-24 h-[420px] w-[620px] -translate-x-1/2 rounded-full bg-[#52ff7f]/10 blur-[150px]" />

      <header className="relative z-10 flex items-center justify-between px-5 pt-6 sm:px-10 lg:px-16">
        <YorumiWordmark className="text-[28px] sm:text-[32px]" />
        <Link href={next} className="text-[13px] font-bold text-white/55 transition-colors hover:text-white">
          Skip
        </Link>
      </header>

      <div className="relative z-10 mx-auto flex max-w-5xl flex-col items-center px-5 pb-16 pt-10 text-center sm:px-10 sm:pt-14">
        {/* Check mark */}
        <div className="welcome-ring relative mb-7 flex h-20 w-20 items-center justify-center rounded-full border border-[#52ff7f]/40 bg-[#52ff7f]/10 shadow-[0_0_60px_-10px_#52ff7f]">
          <svg viewBox="0 0 24 24" className="h-9 w-9" fill="none" aria-hidden="true">
            <path className="welcome-check" d="M5 12.5l4.5 4.5L19 7.5" stroke="#52ff7f" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <p className="access-rise text-[11px] font-black uppercase tracking-[0.24em] text-[#52ff7f]" style={{ animationDelay: "150ms" }}>
          You&apos;re in
        </p>
        <h1
          className="access-rise mt-3 font-display text-[40px] font-black leading-[1.03] tracking-[-0.03em] sm:text-[60px]"
          style={{ animationDelay: "220ms" }}
        >
          Welcome to <YorumiWordmark className="align-baseline" />
        </h1>
        <p className="access-rise mt-4 max-w-lg text-[15px] leading-relaxed text-white/60 sm:text-base" style={{ animationDelay: "290ms" }}>
          {pass.kind === "friends"
            ? "You came in with the friends pass. Grab some snacks, everything is unlocked."
            : "Your spot is saved. Grab some snacks, everything is unlocked."}
        </p>

        {/* Membership pass */}
        <div
          className="access-rise pass-sheen relative mt-10 w-full max-w-[380px] overflow-hidden rounded-[24px] border border-white/15 p-6 text-left shadow-[0_30px_80px_-20px_rgba(255,85,0,0.35)]"
          style={{
            animationDelay: "380ms",
            background: "linear-gradient(135deg, #1d1410 0%, #15161a 45%, #0f1a13 100%)",
          }}
        >
          <div aria-hidden="true" className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[#ff5500]/25 blur-3xl" />
          <div aria-hidden="true" className="absolute -bottom-12 -left-8 h-40 w-40 rounded-full bg-[#52ff7f]/15 blur-3xl" />
          <div className="relative flex items-start justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/45">{passLabel}</p>
              <p className="mt-1 font-display text-3xl font-black tracking-tight">{passNumber}</p>
            </div>
            <YorumiWordmark className="text-xl" />
          </div>
          <div className="relative mt-8 flex items-end justify-between text-[11px]">
            <div>
              <p className="uppercase tracking-[0.18em] text-white/35">Access</p>
              <p className="mt-0.5 font-bold text-white/85">{pass.kind === "member" ? `1 of ${pass.of} spots` : "Everything"}</p>
            </div>
            <div className="text-right">
              <p className="uppercase tracking-[0.18em] text-white/35">Status</p>
              <p className="mt-0.5 flex items-center justify-end gap-1.5 font-bold text-[#52ff7f]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#52ff7f]" aria-hidden="true" />
                Active
              </p>
            </div>
          </div>
        </div>

        <Link
          href={next}
          className="access-rise group mt-9 inline-flex h-14 items-center gap-2 rounded-2xl bg-[#ff5500] px-8 text-[15px] font-extrabold text-white shadow-[0_14px_40px_-12px_#ff5500] transition-all duration-200 hover:-translate-y-px"
          style={{ animationDelay: "460ms" }}
        >
          {next === "/" ? "Start watching" : "Continue where you were going"}
          <ArrowRight className="h-4.5 w-4.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>

        <ul className="access-rise mt-14 grid w-full gap-3 text-left sm:grid-cols-3" style={{ animationDelay: "540ms" }}>
          {TIPS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="rounded-2xl border border-white/[0.07] bg-[#111215]/70 p-5 backdrop-blur-md">
              <Icon className="mb-3 h-5 w-5 text-[#ff5500]" aria-hidden="true" />
              <p className="text-sm font-extrabold">{title}</p>
              <p className="mt-1.5 text-[13px] leading-snug text-white/50">{text}</p>
            </li>
          ))}
        </ul>

        {picks.length > 0 ? (
          <section className="access-rise mt-14 w-full text-left" style={{ animationDelay: "620ms" }}>
            <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-black tracking-tight">
              <Heart className="h-4.5 w-4.5 text-[#ff5500]" aria-hidden="true" />
              Trending right now
            </h2>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {picks.map((title) => (
                <Link key={title.id} href={title.href} className="group">
                  <div className="overflow-hidden rounded-xl border border-white/[0.06]" style={{ backgroundColor: title.color ?? "#15161a" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- small AniList covers, same as the poster wall */}
                    <img
                      src={title.cover}
                      alt=""
                      loading="lazy"
                      className="aspect-[2/3] w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                  <p className="mt-2 line-clamp-2 text-[12px] font-bold leading-snug text-white/75 group-hover:text-white">{title.title}</p>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
