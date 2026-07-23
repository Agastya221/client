"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bookmark, History, LogIn, LogOut, User } from "lucide-react";
import { signOut } from "next-auth/react";
import { clearBookmarks } from "@/lib/anime/bookmarks";
import { clearHistory } from "@/lib/anime/watch-history";

interface UserMenuProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  } | null;
}

export default function UserMenu({ user }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  if (!user) {
    return (
      <Link
        href="/auth/signin"
        className="flex items-center gap-2 rounded-xl bg-[#ff5500] px-3.5 py-2 text-xs font-bold text-white transition-all hover:bg-[#e64d00] active:scale-95 max-[420px]:h-9 max-[420px]:w-9 max-[420px]:justify-center max-[420px]:rounded-full max-[420px]:px-0"
        aria-label="Sign in"
      >
        <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
        <span className="max-[420px]:hidden">Sign In</span>
      </Link>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="User menu"
        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 p-0.5 pr-0 transition-all hover:bg-white/10 sm:pr-3"
      >
        {user.image ? (
          <img
            src={user.image}
            alt={user.name || "User"}
            className="w-8 h-8 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-[#ff5500]/20 flex items-center justify-center">
            <User className="w-4 h-4 text-[#ff5500]" aria-hidden="true" />
          </div>
        )}
        <span className="text-xs font-bold text-white/80 max-w-[100px] truncate hidden sm:block">
          {user.name?.split(" ")[0] || "User"}
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-white/10 bg-[#111215] shadow-[0_8px_30px_rgba(0,0,0,0.5)] z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          {/* User info */}
          <div className="p-4 border-b border-white/5">
            <p className="text-sm font-bold text-white truncate">{user.name}</p>
            <p className="text-[11px] text-white/40 truncate">{user.email}</p>
          </div>

          {/* Links */}
          <div className="p-1.5">
            <MenuLink href="/my-list" icon={Bookmark} label="My List" onClick={() => setOpen(false)} />
            <MenuLink href="/history" icon={History} label="Watch History" onClick={() => setOpen(false)} />
          </div>

          {/* Sign out */}
          <div className="p-1.5 border-t border-white/5">
            <button
              type="button"
              onClick={async () => {
                setOpen(false);
                clearBookmarks();
                clearHistory();
                await signOut({ callbackUrl: "/" });
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors text-left cursor-pointer"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              <span className="text-xs font-bold">Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  icon: Icon,
  label,
  onClick,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-white/70 hover:bg-white/5 hover:text-white transition-colors"
    >
      <Icon className="w-4 h-4" aria-hidden="true" />
      <span className="text-xs font-bold">{label}</span>
    </Link>
  );
}
