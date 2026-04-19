"use client";

import { useState, useEffect } from "react";
import { Bookmark, BookmarkCheck, Loader2 } from "lucide-react";

interface AddToListButtonProps {
  animeId: string;
  title: string;
  poster: string;
  href: string;
}

export default function AddToListButton({ animeId, title, poster, href }: AddToListButtonProps) {
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);

  // Check if already bookmarked on mount
  useEffect(() => {
    fetch("/api/bookmarks")
      .then(async (res) => {
        if (!res.ok) return;
        const bookmarks = await res.json();
        const exists = bookmarks.some((b: { animeId: string }) => b.animeId === animeId);
        setIsBookmarked(exists);
      })
      .catch(() => null)
      .finally(() => setChecked(true));
  }, [animeId]);

  const toggleBookmark = async () => {
    if (loading) return;
    setLoading(true);

    try {
      if (isBookmarked) {
        await fetch(`/api/bookmarks?animeId=${encodeURIComponent(animeId)}`, { method: "DELETE" });
        setIsBookmarked(false);
      } else {
        await fetch("/api/bookmarks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ animeId, title, poster, href, status: "PLAN_TO_WATCH" }),
        });
        setIsBookmarked(true);
      }
    } catch {
      // If 401, redirect to sign in
      window.location.href = "/auth/signin";
    } finally {
      setLoading(false);
    }
  };

  if (!checked) {
    return (
      <button
        type="button"
        disabled
        className="flex items-center gap-2 text-white/40 font-bold text-sm px-6 py-4 rounded-full bg-white/5 border border-white/10"
      >
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading...
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleBookmark}
      disabled={loading}
      className={`flex items-center gap-2 font-bold text-sm px-6 py-4 rounded-full transition-all border active:scale-95 ${
        isBookmarked
          ? "bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/25"
          : "bg-white/10 text-white/70 hover:text-white border-white/10 hover:bg-white/15"
      }`}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : isBookmarked ? (
        <BookmarkCheck className="w-4 h-4 fill-current" />
      ) : (
        <Bookmark className="w-4 h-4" />
      )}
      {isBookmarked ? "In My List" : "Add to List"}
    </button>
  );
}
