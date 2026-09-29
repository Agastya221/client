import Navbar from "@/components/ui/Navbar";
import SiteFooter from "@/components/ui/SiteFooter";
import WatchPartyLanding from "@/components/anime/WatchPartyLanding";
import { WATCH_PARTY_ENABLED } from "@/lib/features";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Watch Together | Yorumi",
  description: "Create a watch party room and watch anime in sync with your friends.",
};

export default function WatchPartyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <main className="min-h-screen bg-[#0a0b0c] text-[#eaeaea] flex flex-col">
      <Navbar />
      {WATCH_PARTY_ENABLED ? (
        <WatchPartyLanding searchParamsPromise={searchParams} />
      ) : (
        <section className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-6 py-32 text-center">
          <h1 className="text-2xl font-black text-white sm:text-3xl">Watch Together is taking a break</h1>
          <p className="mt-3 text-sm leading-relaxed text-white/60">
            We&apos;re rebuilding synced watching to be faster and more reliable. It will be back soon.
          </p>
          <Link
            href="/"
            className="mt-8 rounded-full border border-white/15 bg-white/10 px-6 py-3 text-sm font-bold text-white/85 transition-colors hover:bg-white/15 hover:text-white"
          >
            Back to home
          </Link>
        </section>
      )}
      <SiteFooter />
    </main>
  );
}
