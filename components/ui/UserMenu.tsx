"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bookmark, History, LogIn, LogOut, User } from "lucide-react";

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
        className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#ff5500] text-white text-xs font-bold hover:bg-[#e64d00] transition-all active:scale-95"
      >
        <LogIn className="w-3.5 h-3.5" />
        Sign In
      </Link>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition-all p-0.5 pr-3"
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
            <User className="w-4 h-4 text-[#ff5500]" />
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
            <MenuLink href="/bookmarks" icon={Bookmark} label="My Bookmarks" onClick={() => setOpen(false)} />
            <MenuLink href="/history" icon={History} label="Watch History" onClick={() => setOpen(false)} />
          </div>

          {/* Sign out */}
          <div className="p-1.5 border-t border-white/5">
            <form action="/api/auth/signout" method="POST">
              <button
                type="submit"
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors text-left"
              >
                <LogOut className="w-4 h-4" />
                <span className="text-xs font-bold">Sign Out</span>
              </button>
            </form>
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
      <Icon className="w-4 h-4" />
      <span className="text-xs font-bold">{label}</span>
    </Link>
  );
}
