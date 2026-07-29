import { auth } from "@/lib/auth";
import Navbar from "@/components/ui/Navbar";
import SiteFooter from "@/components/ui/SiteFooter";
import MyListClient from "./MyListClient";

export const metadata = {
  title: "My List | Yorumi",
  description: "Your personal anime watchlist on Yorumi. Keep track of what you're watching, plan to watch, and more.",
};

export const dynamic = "force-dynamic";

export default async function MyListPage() {
  const session = await auth();

  return (
    <main className="min-h-screen bg-[#0a0b0c] text-white">
      <MyListClient user={session?.user ?? null} />
      <SiteFooter />
    </main>
  );
}
