import Link from "next/link";
import { Play, Plus } from "lucide-react";

export default function Hero() {
  return (
    <div className="relative w-full h-[85vh] flex items-center">
      <div className="absolute inset-0 z-0">
        <img 
          src="https://images.unsplash.com/photo-1541562232579-512a21360020?q=80&w=2560&auto=format&fit=crop" 
          alt="Solo Leveling" 
          className="w-full h-full object-cover object-top opacity-50"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/80 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-surface via-surface/50 to-transparent" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 w-full pt-20">
        <div className="max-w-2xl">
          <div className="flex items-center gap-3 mb-6">
            <span className="px-2 py-1 bg-tertiary-container text-on-tertiary-variant text-xs font-bold uppercase tracking-wider rounded-sm">Sub</span>
            <span className="px-2 py-1 bg-[#4d2b00] text-[#ffb347] text-xs font-bold uppercase tracking-wider rounded-sm">Dub</span>
            <span className="text-on-surface-variant text-sm font-medium tracking-wide border-l border-outline-variant pl-3">2024 • 12 Episodes</span>
          </div>

          <h1 className="text-6xl md:text-8xl font-black text-white tracking-[-0.04em] leading-[0.9] mb-6">
            SOLO<br />LEVELING
          </h1>

          <p className="text-on-surface-variant text-lg leading-relaxed mb-10 max-w-xl">
            In a world where hunters must battle deadly monsters to protect mankind, a notoriously weak hunter named Sung Jinwoo finds himself in a seemingly endless struggle for survival.
          </p>

          <div className="flex items-center gap-4">
            <button className="flex items-center gap-2 px-8 py-4 bg-gradient-to-br from-[#dbfcff] to-[#00f0ff] text-[#00363a] font-bold rounded-sm shadow-ambient hover:scale-105 transition-transform">
              <Play className="fill-current w-5 h-5" />
              WATCH NOW
            </button>
            <button className="flex items-center gap-2 px-8 py-4 bg-transparent border border-outline/40 text-on-surface font-bold rounded-sm hover:bg-primary/10 transition-colors">
              <Plus className="w-5 h-5" />
              ADD TO LIST
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
