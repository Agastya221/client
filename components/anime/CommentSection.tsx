"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Heart,
  MessageCircle,
  CornerDownRight,
  Trash2,
  EyeOff,
  Eye,
  Clock,
  ChevronDown,
  ChevronUp,
  Send,
  LogIn,
  AlertTriangle,
  Flame,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

interface CommentUser {
  id: string;
  name: string | null;
  image: string | null;
}
interface CommentLike { userId: string; }
interface CommentData {
  id: string;
  userId: string;
  animeId: string;
  episodeNumber: number | null;
  content: string;
  isSpoiler: boolean;
  timestamp: number | null;
  parentId: string | null;
  createdAt: string;
  user: CommentUser;
  likes: CommentLike[];
  replies?: CommentData[];
}
interface CommentSectionProps {
  animeId: string;
  episodeNumber?: number;
  currentUserId?: string | null;
  onTimestampClick?: (time: number) => void;
  mobileSummary?: boolean;
  accentColor?: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmt(s: number): string {
  const m = Math.floor(s / 60), ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, "0")}`;
}

const GRADIENTS = [
  ["#7c3aed","#4f46e5"],["#ea580c","#dc2626"],["#0891b2","#2563eb"],
  ["#059669","#0d9488"],["#db2777","#be185d"],["#d97706","#ea580c"],
  ["#7c3aed","#a21caf"],["#dc2626","#ea580c"],
];
function avatarGrad(name: string): string[] {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return GRADIENTS[Math.abs(h) % GRADIENTS.length];
}

function renderContent(content: string) {
  if (!content) return null;
  const imgRe = /img\d*\((https?:\/\/[^\s)]+)\)|!\[.*?\]\((https?:\/\/[^\s)]+)\)/gi;
  const imgs: string[] = [];
  let m;
  while ((m = imgRe.exec(content)) !== null) {
    const u = m[1] || m[2];
    if (u) imgs.push(u);
  }
  const text = content
    .replace(/img\d*\((https?:\/\/[^\s)]+)\)/gi, "")
    .replace(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/gi, "")
    .trim();

  return (
    <div className="space-y-1">
      {text.split("\n").map((line, i) => {
        const t = line.trim();
        if (!t) return <div key={i} className="h-1" />;
        if (/^#{2,3}\s/.test(t)) return <p key={i} className="text-[12px] font-bold text-white/60 mt-1.5">{t.replace(/^#+\s*/, "")}</p>;
        if (/^-{3,}$/.test(t)) return <hr key={i} className="border-white/8 my-1" />;
        return <p key={i} className="leading-[1.65]">{line}</p>;
      })}
      {imgs.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {imgs.map((u, i) => (
            <img key={i} src={u} alt="" className="max-h-44 max-w-full rounded-lg border border-white/10 object-contain bg-black/30"
              loading="lazy" onError={(e) => { (e.target as HTMLElement).style.display = "none"; }} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Skeleton loader for one comment card ─── */
function CommentSkeleton({ isReply = false }: { isReply?: boolean }) {
  return (
    <div className={`flex gap-3 px-4 py-3.5 ${isReply ? "ml-11 opacity-70" : ""}`}>
      <div className={`shrink-0 rounded-full bg-white/8 animate-pulse ${isReply ? "h-7 w-7" : "h-9 w-9"}`} />
      <div className="flex-1 space-y-2 pt-1">
        <div className="flex gap-2 items-center">
          <div className="h-2.5 w-20 rounded-full bg-white/8 animate-pulse" />
          <div className="h-2 w-10 rounded-full bg-white/5 animate-pulse" />
        </div>
        <div className="h-2.5 w-full rounded-full bg-white/6 animate-pulse" />
        <div className="h-2.5 w-4/5 rounded-full bg-white/5 animate-pulse" />
        <div className="h-2.5 w-2/3 rounded-full bg-white/4 animate-pulse" />
      </div>
    </div>
  );
}

export default function CommentSection({
  animeId,
  episodeNumber,
  currentUserId,
  onTimestampClick,
  mobileSummary = false,
  accentColor = "#ff5500",
}: CommentSectionProps) {
  const [comments, setComments] = useState<CommentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [isSpoiler, setIsSpoiler] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [timestamp, setTimestamp] = useState<number | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /** `fresh` skips the 20-second edge copy (worker.ts), used right after this viewer changed something. */
  const fetchComments = useCallback(async (fresh = false) => {
    setLoading(true);
    setComments([]);
    try {
      const p = new URLSearchParams({ animeId });
      if (episodeNumber) p.set("episode", String(episodeNumber));
      if (fresh) p.set("fresh", "1");
      const res = await fetch(`/api/comments?${p}`);
      if (res.ok) setComments(await res.json());
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [animeId, episodeNumber]);

  useEffect(() => { void fetchComments(); }, [fetchComments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ animeId, episodeNumber: episodeNumber || null, content: newComment.trim(), isSpoiler, timestamp }),
      });
      if (res.ok) { setNewComment(""); setIsSpoiler(false); setTimestamp(null); setFocused(false); await fetchComments(true); }
    } finally { setSubmitting(false); }
  };

  const handleReply = async (parentId: string, content: string) => {
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ animeId, episodeNumber: episodeNumber || null, content: content.trim(), parentId }),
      });
      if (res.ok) { setReplyTo(null); await fetchComments(true); }
    } finally { setSubmitting(false); }
  };

  const handleLike = async (commentId: string) => {
    if (!currentUserId) return;
    setComments((prev) => prev.map((c) => {
      const toggle = (x: CommentData) => {
        if (x.id !== commentId) return x;
        const liked = x.likes.some((l) => l.userId === currentUserId);
        return { ...x, likes: liked ? x.likes.filter((l) => l.userId !== currentUserId) : [...x.likes, { userId: currentUserId }] };
      };
      return { ...toggle(c), replies: c.replies?.map(toggle) };
    }));
    await fetch("/api/comments/like", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commentId }) });
  };

  const handleDelete = async (id: string) => {
    if (await fetch(`/api/comments?id=${id}`, { method: "DELETE" }).then((r) => r.ok)) void fetchComments(true);
  };

  const total = comments.reduce((s, c) => s + 1 + (c.replies?.length || 0), 0);

  return (
    <>
      {/* Mobile accordion */}
      {mobileSummary && (
        <button type="button" onClick={() => setMobileExpanded((v) => !v)}
          className="flex w-full items-center justify-between rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-3.5 sm:hidden backdrop-blur-md"
          aria-expanded={mobileExpanded}
        >
          <span className="flex items-center gap-2.5">
            <MessageCircle className="h-4 w-4" style={{ color: accentColor }} />
            <span className="text-sm font-semibold text-white/80">
              {loading ? "Loading…" : `${total} Comments`}
            </span>
            {episodeNumber && <span className="text-[11px] text-white/25">EP {episodeNumber}</span>}
          </span>
          {mobileExpanded ? <ChevronUp className="h-4 w-4 text-white/25" /> : <ChevronDown className="h-4 w-4 text-white/25" />}
        </button>
      )}

      <div className={mobileSummary && !mobileExpanded ? "hidden sm:block" : "block"}>

        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-4 px-1">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: `${accentColor}20` }}>
                <MessageCircle className="h-4 w-4" style={{ color: accentColor }} />
              </div>
              {!loading && total > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full text-[9px] font-bold text-white px-1"
                  style={{ background: accentColor }}>
                  {total > 99 ? "99+" : total}
                </span>
              )}
            </div>
            <div>
              <h3 className="text-[13px] font-bold text-white/90 leading-none tracking-tight">Discussion</h3>
              <p className="text-[10px] text-white/30 mt-0.5 flex items-center gap-1">
                {episodeNumber ? `Episode ${episodeNumber}` : "General"}
                <span className="inline-block w-1 h-1 rounded-full bg-white/20" />
                Community
              </p>
            </div>
          </div>

          {!loading && total > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 text-[9px] font-bold text-emerald-400/80 uppercase tracking-wide">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </span>
            </div>
          )}
        </div>

        {/* ── Compose ── */}
        <div className="mb-5 px-1">
          {currentUserId ? (
            <form onSubmit={handleSubmit}>
              <div className={`rounded-2xl border overflow-hidden transition-all duration-300 ${
                focused
                  ? "border-white/[0.15] bg-[#1a1c1f] shadow-2xl shadow-black/40 ring-1 ring-white/[0.05]"
                  : "border-white/[0.07] bg-white/[0.025] hover:border-white/[0.1] hover:bg-white/[0.035]"
              }`}>
                {/* Avatar + textarea row */}
                <div className="flex gap-3 px-4 pt-4 pb-2">
                  <div className="shrink-0 h-8 w-8 rounded-full overflow-hidden flex items-center justify-center text-[11px] font-bold text-white"
                    style={{ background: `linear-gradient(135deg, ${avatarGrad("me")[0]}, ${avatarGrad("me")[1]})` }}
                  >
                    Me
                  </div>
                  <textarea
                    ref={textareaRef}
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onFocus={() => setFocused(true)}
                    onBlur={() => { if (!newComment.trim()) setFocused(false); }}
                    placeholder="What did you think of this episode?"
                    rows={focused || newComment ? 3 : 1}
                    maxLength={2000}
                    className="flex-1 bg-transparent text-sm text-white/90 placeholder:text-white/25 focus:outline-none resize-none leading-relaxed"
                  />
                </div>

                {(focused || newComment) && (
                  <div className="flex items-center justify-between border-t border-white/[0.05] px-4 py-2.5 gap-2">
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => setIsSpoiler((v) => !v)}
                        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-all ${
                          isSpoiler ? "bg-amber-500/15 text-amber-300 border border-amber-400/25" : "text-white/30 hover:text-white/60 hover:bg-white/5"
                        }`}
                      >
                        <AlertTriangle className="h-3 w-3" />
                        Spoiler
                      </button>
                      {episodeNumber && (
                        <button type="button"
                          onClick={() => {
                            if (timestamp !== null) { setTimestamp(null); return; }
                            const t = prompt("Timestamp (MM:SS):");
                            if (!t) return;
                            const p = t.split(":");
                            if (p.length === 2) setTimestamp(+p[0] * 60 + +p[1]);
                            else if (!isNaN(+p[0])) setTimestamp(+p[0]);
                          }}
                          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-all ${
                            timestamp !== null ? "text-white/80 border border-white/15" : "text-white/30 hover:text-white/60 hover:bg-white/5"
                          }`}
                          style={timestamp !== null ? { background: `${accentColor}15`, color: accentColor, borderColor: `${accentColor}30` } : {}}
                        >
                          <Clock className="h-3 w-3" />
                          {timestamp !== null ? fmt(timestamp) : "Time"}
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-white/15 tabular-nums">{newComment.length}/2000</span>
                      <button type="submit" disabled={!newComment.trim() || submitting}
                        className="flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-[12px] font-bold text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 hover:brightness-110"
                        style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)` }}
                      >
                        <Send className="h-3 w-3" />
                        {submitting ? "Posting…" : "Post"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </form>
          ) : (
            <Link href="/auth/signin"
              className="group flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-4 text-white/40 hover:text-white/70 hover:border-white/12 hover:bg-white/[0.04] transition-all"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/8 bg-white/5 group-hover:bg-white/10 transition-all">
                <LogIn className="h-3.5 w-3.5" />
              </div>
              <div>
                <p className="text-[13px] font-semibold">Join the discussion</p>
                <p className="text-[11px] text-white/25 mt-0.5">Sign in with AniList to comment</p>
              </div>
              <Sparkles className="ml-auto h-4 w-4 opacity-20" />
            </Link>
          )}
        </div>

        {/* ── Comment list ── */}
        {loading ? (
          <div className="divide-y divide-white/[0.035]">
            {[...Array(4)].map((_, i) => <CommentSkeleton key={i} />)}
          </div>
        ) : comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.025]">
              <MessageCircle className="h-7 w-7 text-white/15" />
            </div>
            <p className="text-sm font-semibold text-white/35">No discussion yet</p>
            <p className="mt-1 text-xs text-white/20">Be the first to share your thoughts!</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {comments.map((c, i) => (
              <CommentItem
                key={c.id}
                comment={c}
                currentUserId={currentUserId}
                onLike={handleLike}
                onDelete={handleDelete}
                onReply={(id) => setReplyTo(replyTo === id ? null : id)}
                replyTo={replyTo}
                onReplySubmit={handleReply}
                submitting={submitting}
                onTimestampClick={onTimestampClick}
                accentColor={accentColor}
                isLast={i === comments.length - 1}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/* ─── Single Comment Card ─── */
function CommentItem({
  comment, currentUserId, onLike, onDelete, onReply, replyTo, onReplySubmit,
  submitting, onTimestampClick, accentColor = "#ff5500", isReply = false, isLast = false,
}: {
  comment: CommentData; currentUserId?: string | null;
  onLike: (id: string) => void; onDelete: (id: string) => void;
  onReply: (id: string) => void; replyTo: string | null;
  onReplySubmit: (pid: string, c: string) => void; submitting: boolean;
  onTimestampClick?: (t: number) => void; accentColor?: string;
  isReply?: boolean; isLast?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [reply, setReply] = useState("");
  const replyInputRef = useRef<HTMLInputElement>(null);

  const liked = !!currentUserId && comment.likes.some((l) => l.userId === currentUserId);
  const isOwn = currentUserId === comment.userId;
  const isBlurred = comment.isSpoiler && !revealed;
  const isLong = comment.content.length > 400 || comment.content.split("\n").length > 5;
  const name = comment.user.name || "Anime Fan";
  const [c1, c2] = avatarGrad(name);

  useEffect(() => {
    if (replyTo === comment.id) replyInputRef.current?.focus();
  }, [replyTo, comment.id]);

  return (
    <div className={isReply ? "" : isLast ? "" : ""}>
      <div className={`group/card px-4 py-4 transition-colors duration-150 hover:bg-white/[0.02] rounded-xl ${
        isReply ? "ml-3 sm:ml-8 lg:ml-10 mt-1.5 bg-white/[0.015] border-l-2 border-white/10 pl-3 sm:pl-4 rounded-xl" : ""
      }`}>
        <div className="flex gap-3">
          {/* Avatar */}
          <div className="shrink-0">
            {comment.user.image ? (
              <img src={comment.user.image} alt={name}
                className={`rounded-full object-cover ring-1 ring-white/[0.08] ${isReply ? "h-7 w-7" : "h-9 w-9"}`}
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className={`flex items-center justify-center rounded-full font-bold text-white ring-1 ring-white/[0.08] ${isReply ? "h-7 w-7 text-[10px]" : "h-9 w-9 text-xs"}`}
                style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}
              >
                {name[0].toUpperCase()}
              </div>
            )}
          </div>

          {/* Main body */}
          <div className="flex-1 min-w-0">
            {/* Meta row */}
            <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 mb-2">
              <span className={`font-semibold text-white/90 ${isReply ? "text-[12px]" : "text-[13px]"}`}>{name}</span>
              <span className="text-[10px] text-white/25">{timeAgo(comment.createdAt)}</span>

              {comment.timestamp !== null && onTimestampClick && (
                <button type="button" onClick={() => onTimestampClick!(comment.timestamp!)}
                  className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold transition-all hover:brightness-125 active:scale-95"
                  style={{ background: `${accentColor}18`, color: accentColor }}
                >
                  <Clock className="h-2.5 w-2.5" />
                  {fmt(comment.timestamp)}
                </button>
              )}

              {comment.isSpoiler && !revealed ? (
                <span className="flex items-center gap-1 rounded-md bg-amber-500/10 border border-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-400/80 uppercase tracking-wide">
                  <EyeOff className="h-2.5 w-2.5" />
                  Spoiler
                </span>
              ) : comment.isSpoiler && revealed ? (
                <button
                  type="button"
                  onClick={() => setRevealed(false)}
                  className="flex items-center gap-1 rounded-md bg-white/5 border border-white/10 px-1.5 py-0.5 text-[9px] font-bold text-white/40 hover:text-white/70 transition-colors uppercase tracking-wide ml-auto"
                >
                  <EyeOff className="h-2.5 w-2.5" />
                  Hide spoiler
                </button>
              ) : null}

              {comment.likes.length >= 5 && (
                <span className="flex items-center gap-0.5 rounded-md bg-orange-500/10 px-1.5 py-0.5 text-[9px] font-bold text-orange-400/80">
                  <Flame className="h-2.5 w-2.5" />
                  Hot
                </span>
              )}
            </div>

            {/* Content */}
            <div className="relative">
              {/* The text body — always rendered, blur applied via CSS */}
              <div
                className={`text-[13px] leading-relaxed transition-all duration-300 ${
                  isBlurred ? "blur-sm select-none opacity-40" : "text-white/75"
                } ${!expanded && isLong && !isBlurred ? "max-h-28 overflow-hidden" : ""}`}
              >
                {renderContent(comment.content)}
              </div>

              {/* Spoiler overlay — covers the blurred text and handles click-to-reveal */}
              {isBlurred && (
                <button
                  type="button"
                  onClick={() => setRevealed(true)}
                  aria-label="Reveal spoiler"
                  className="absolute inset-0 flex items-center justify-center w-full rounded-xl transition-all hover:bg-white/[0.02] group/spoiler"
                >
                  <span className="flex items-center gap-2 rounded-full border border-amber-400/25 bg-black/70 backdrop-blur-md px-4 py-2 text-[12px] font-semibold text-amber-300/90 shadow-lg transition-all group-hover/spoiler:border-amber-400/40 group-hover/spoiler:text-amber-300">
                    <Eye className="h-3.5 w-3.5" />
                    Click to reveal spoiler
                  </span>
                </button>
              )}

              {/* Read more gradient */}
              {!expanded && isLong && !isBlurred && (
                <div className="relative -mt-10 pt-10 bg-gradient-to-t from-[#111214] via-[#111214]/70 to-transparent flex justify-center">
                  <button type="button" onClick={() => setExpanded(true)}
                    className="flex items-center gap-1 rounded-full border border-white/10 bg-black/50 backdrop-blur-sm px-3.5 py-1 text-[11px] font-semibold text-white/45 hover:text-white/75 hover:border-white/20 transition-all"
                  >
                    Read more <ChevronDown className="h-3 w-3" />
                  </button>
                </div>
              )}
              {expanded && isLong && (
                <button type="button" onClick={() => setExpanded(false)}
                  className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-white/25 hover:text-white/55 transition-colors"
                >
                  Show less <ChevronUp className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Action row */}
            <div className="flex items-center gap-0.5 mt-2.5">
              <button type="button" onClick={() => onLike(comment.id)} disabled={!currentUserId}
                className={`group/hrt flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold transition-all ${
                  liked ? "text-rose-400 bg-rose-400/10" : "text-white/25 hover:text-rose-300 hover:bg-rose-400/8"
                } disabled:cursor-default`}
              >
                <Heart className={`h-3.5 w-3.5 transition-transform group-hover/hrt:scale-110 ${liked ? "fill-current" : ""}`} />
                {comment.likes.length > 0 && comment.likes.length}
              </button>

              {!isReply && currentUserId && (
                <button type="button" onClick={() => onReply(comment.id)}
                  className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold transition-all ${
                    replyTo === comment.id ? "text-white/70 bg-white/8" : "text-white/25 hover:text-white/60 hover:bg-white/5"
                  }`}
                >
                  <CornerDownRight className="h-3.5 w-3.5" />
                  {replyTo === comment.id ? "Cancel" : "Reply"}
                </button>
              )}

              {isOwn && (
                <button type="button" onClick={() => onDelete(comment.id)}
                  className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] text-white/15 hover:text-rose-400 hover:bg-rose-400/8 transition-all opacity-0 group-hover/card:opacity-100"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Reply input */}
            {replyTo === comment.id && (
              <div className="mt-3 flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 focus-within:border-white/20 focus-within:bg-white/[0.06] transition-all">
                  <input
                    ref={replyInputRef}
                    type="text"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder={`Reply to ${name}…`}
                    maxLength={2000}
                    className="flex-1 bg-transparent text-[12px] text-white/90 placeholder:text-white/25 focus:outline-none"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        onReplySubmit(comment.id, reply);
                        setReply("");
                      }
                    }}
                  />
                </div>
                <button type="button"
                  onClick={() => { onReplySubmit(comment.id, reply); setReply(""); }}
                  disabled={!reply.trim() || submitting}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white transition-all disabled:opacity-30 active:scale-95 hover:brightness-110"
                  style={{ background: accentColor }}
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Nested replies */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="space-y-0 pb-2">
          {comment.replies.map((r) => (
            <CommentItem key={r.id} comment={r} currentUserId={currentUserId}
              onLike={onLike} onDelete={onDelete} onReply={onReply}
              replyTo={replyTo} onReplySubmit={onReplySubmit} submitting={submitting}
              onTimestampClick={onTimestampClick} accentColor={accentColor} isReply
            />
          ))}
        </div>
      )}
    </div>
  );
}
