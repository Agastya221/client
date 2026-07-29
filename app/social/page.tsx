import Navbar from "@/components/ui/Navbar";
import SiteFooter from "@/components/ui/SiteFooter";
import { MessageSquare, Heart, TrendingUp, Users } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Community | Yorumi",
  description: "Join the Yorumi community — discuss episodes, share recommendations, and connect with fellow anime fans.",
};

const FEATURES = [
  {
    icon: MessageSquare,
    title: "Episode Discussions",
    desc: "Comment on episodes you're watching. Share your reactions, theories, and hot takes with other viewers.",
    color: "#ff5500",
    status: "Live on watch pages",
    live: true,
  },
  {
    icon: Heart,
    title: "Likes & Reactions",
    desc: "Like the comments that resonate with you. See what the community thinks about each episode.",
    color: "#f43f5e",
    status: "Live on watch pages",
    live: true,
  },
  {
    icon: TrendingUp,
    title: "Spoiler Tags",
    desc: "Use [spoiler]...[/spoiler] tags to hide plot revelations. Click to reveal — safe for everyone.",
    color: "#a855f7",
    status: "Live on watch pages",
    live: true,
  },
  {
    icon: Users,
    title: "Community Feed",
    desc: "A global feed of the most active discussions, trending anime, and community highlights.",
    color: "#3b82f6",
    status: "Coming soon",
    live: false,
  },
];

export default function SocialPage() {
  return (
    <main className="min-h-screen bg-[#0a0b0c] text-white">
      <Navbar />

      <section className="pt-24 pb-16 px-4 lg:px-12 xl:px-16">
        <div className="max-w-4xl mx-auto">
          <div className="mb-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#ff5500]/15 flex items-center justify-center mx-auto mb-5">
              <Users className="w-8 h-8 text-[#ff5500]" />
            </div>
            <h1 className="text-4xl font-black text-white mb-3">Community</h1>
            <p className="text-white/40 text-sm max-w-lg mx-auto">
              Yorumi&apos;s social features are built right into the watch experience. Every episode has its own comment thread.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 hover:bg-white/[0.04] transition-all"
                >
                  <div className="flex items-start gap-4">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${feature.color}15`, color: feature.color }}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-bold text-white">{feature.title}</h3>
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          feature.live
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-white/5 text-white/30"
                        }`}>
                          {feature.status}
                        </span>
                      </div>
                      <p className="text-xs text-white/40 leading-relaxed">{feature.desc}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-12 text-center">
            <p className="text-white/30 text-sm mb-4">Comments are available on every watch page</p>
            <Link
              href="/search?sort=trending"
              className="inline-flex items-center gap-2 rounded-full bg-[#ff5500] px-6 py-3 text-sm font-bold text-white hover:bg-[#e64d00] transition-colors"
            >
              Start Watching & Discussing
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
