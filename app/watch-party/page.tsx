import Navbar from "@/components/ui/Navbar";
import SiteFooter from "@/components/ui/SiteFooter";
import WatchPartyLanding from "@/components/anime/WatchPartyLanding";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Watch Together | AnimePlay",
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
      <WatchPartyLanding searchParamsPromise={searchParams} />
      <SiteFooter />
    </main>
  );
}
