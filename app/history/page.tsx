import Navbar from "@/components/ui/Navbar";
import SiteFooter from "@/components/ui/SiteFooter";
import HistoryClient from "./HistoryClient";

export const metadata = {
  title: "Watch History | Yorumi",
  description: "Your anime watch history on Yorumi. Resume where you left off, track your progress.",
};

export default function HistoryPage() {
  return (
    <main className="min-h-screen bg-[#0a0b0c] text-white">
      <HistoryClient />
      <SiteFooter />
    </main>
  );
}
