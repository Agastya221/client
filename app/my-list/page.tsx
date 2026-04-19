import Navbar from "@/components/ui/Navbar";
import SiteFooter from "@/components/ui/SiteFooter";
import MyListClient from "./MyListClient";

export const metadata = {
  title: "My List | AnimeKAI",
  description: "Your personal anime watchlist on AnimeKAI. Keep track of what you're watching, plan to watch, and more.",
};

export default function MyListPage() {
  return (
    <main className="min-h-screen bg-[#0a0b0c] text-white">
      <Navbar />
      <MyListClient />
      <SiteFooter />
    </main>
  );
}
