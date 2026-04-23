"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Heart,
  MessageCircle,
  CornerDownRight,
  Trash2,
  AlertTriangle,
  Eye,
  EyeOff,
  Clock,
  Send,
  LogIn,
} from "lucide-react";
import Link from "next/link";

interface CommentUser {
  id: string;
  name: string | null;
  image: string | null;
}

interface CommentLike {
  userId: string;
}

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
  return new Date(dateStr).toLocaleDateString();
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function CommentSection({
  animeId,
  episodeNumber,
  currentUserId,
  onTimestampClick,
}: CommentSectionProps) {
  const [comments, setComments] = useState<CommentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [isSpoiler, setIsSpoiler] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [timestamp, setTimestamp] = useState<number | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");

  const fetchComments = useCallback(async () => {
    try {
      const params = new URLSearchParams({ animeId });
      if (episodeNumber) params.set("episode", String(episodeNumber));
      const res = await fetch(`/api/comments?${params}`);
      if (res.ok) {
        const data = await res.json();
        setComments(data);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [animeId, episodeNumber]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          animeId,
          episodeNumber: episodeNumber || null,
          content: newComment.trim(),
          isSpoiler,
          timestamp,
        }),
      });

      if (res.ok) {
        setNewComment("");
        setIsSpoiler(false);
        setTimestamp(null);
        await fetchComments();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleReply = async (parentId: string, content: string) => {
    if (!content.trim() || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          animeId,
          episodeNumber: episodeNumber || null,
          content: content.trim(),
          parentId,
        }),
      });

      if (res.ok) {
        setReplyContent("");
        setReplyTo(null);
        await fetchComments();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleLike = async (commentId: string) => {
    if (!currentUserId) return;
    // Optimistic update
    setComments((prev) =>
      prev.map((c) => {
        if (c.id === commentId) {
          const liked = c.likes.some((l) => l.userId === currentUserId);
          return {
            ...c,
            likes: liked
              ? c.likes.filter((l) => l.userId !== currentUserId)
              : [...c.likes, { userId: currentUserId }],
          };
        }
        // Check replies too
        if (c.replies) {
          return {
            ...c,
            replies: c.replies.map((r) => {
              if (r.id === commentId) {
                const liked = r.likes.some((l) => l.userId === currentUserId);
                return {
                  ...r,
                  likes: liked
                    ? r.likes.filter((l) => l.userId !== currentUserId)
                    : [...r.likes, { userId: currentUserId }],
                };
              }
              return r;
            }),
          };
        }
        return c;
      })
    );

    await fetch("/api/comments/like", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commentId }),
    });
  };

  const handleDelete = async (commentId: string) => {
    const res = await fetch(`/api/comments?id=${commentId}`, { method: "DELETE" });
    if (res.ok) {
      await fetchComments();
    }
  };

  const totalComments = comments.reduce(
    (sum, c) => sum + 1 + (c.replies?.length || 0),
    0
  );

  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#ff5500]/10 flex items-center justify-center">
            <MessageCircle className="w-4 h-4 text-[#ff5500]" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">
              Comments
              {totalComments > 0 && (
                <span className="ml-2 text-white/40 font-medium">({totalComments})</span>
              )}
            </h3>
            <p className="text-[10px] text-white/30">
              {episodeNumber ? `Episode ${episodeNumber}` : "General"}
            </p>
          </div>
        </div>
      </div>

      {/* Compose */}
      <div className="p-4 border-b border-white/5">
        {currentUserId ? (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="relative">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Share your thoughts..."
                rows={2}
                maxLength={2000}
                className="w-full bg-white/[0.04] border border-white/8 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#ff5500]/40 focus:ring-1 focus:ring-[#ff5500]/20 resize-none transition-all"
              />
              <span className="absolute bottom-2 right-3 text-[10px] text-white/20">
                {newComment.length}/2000
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsSpoiler((v) => !v)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                    isSpoiler
                      ? "bg-yellow-500/15 text-yellow-400 border border-yellow-500/20"
                      : "bg-white/5 text-white/40 border border-white/5 hover:text-white/60"
                  }`}
                >
                  <AlertTriangle className="w-3 h-3" />
                  Spoiler
                </button>
                {episodeNumber && (
                  <button
                    type="button"
                    onClick={() => {
                      if (timestamp !== null) {
                        setTimestamp(null);
                        return;
                      }
                      const t = prompt("Enter timestamp (MM:SS):");
                      if (t) {
                        const parts = t.split(":");
                        if (parts.length === 2) {
                          setTimestamp(parseInt(parts[0]) * 60 + parseInt(parts[1]));
                        } else if (parts.length === 1 && !isNaN(parseInt(parts[0]))) {
                          setTimestamp(parseInt(parts[0]));
                        }
                      }
                    }}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                      timestamp !== null
                        ? "bg-[#ff5500]/15 text-[#ff5500] border border-[#ff5500]/20"
                        : "bg-white/5 text-white/40 border border-white/5 hover:text-white/60"
                    }`}
                  >
                    <Clock className="w-3 h-3" />
                    {timestamp !== null ? `${Math.floor(timestamp / 60)}:${(timestamp % 60).toString().padStart(2, '0')}` : "Timestamp"}
                  </button>
                )}
              </div>

              <button
                type="submit"
                disabled={!newComment.trim() || submitting}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#ff5500] text-white text-xs font-bold hover:bg-[#e64d00] disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
              >
                <Send className="w-3.5 h-3.5" />
                {submitting ? "Posting..." : "Post"}
              </button>
            </div>
          </form>
        ) : (
          <Link
            href="/auth/signin"
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-white/8 bg-white/[0.03] text-white/50 hover:text-white/70 hover:border-white/15 transition-all"
          >
            <LogIn className="w-4 h-4" />
            <span className="text-xs font-bold">Sign in to comment</span>
          </Link>
        )}
      </div>

      {/* Comments */}
      <div className="divide-y divide-white/[0.03]">
        {loading ? (
          <div className="p-8 text-center">
            <div className="w-6 h-6 border-2 border-[#ff5500]/30 border-t-[#ff5500] rounded-full animate-spin mx-auto" />
            <p className="text-white/30 text-xs mt-3">Loading comments...</p>
          </div>
        ) : comments.length === 0 ? (
          <div className="p-8 text-center">
            <MessageCircle className="w-8 h-8 text-white/10 mx-auto mb-3" />
            <p className="text-white/40 text-sm font-medium">No comments yet</p>
            <p className="text-white/20 text-xs mt-1">Be the first to share your thoughts!</p>
          </div>
        ) : (
          comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              currentUserId={currentUserId}
              onLike={handleLike}
              onDelete={handleDelete}
              onReply={(id) => {
                setReplyTo(replyTo === id ? null : id);
                setReplyContent("");
              }}
              replyTo={replyTo}
              onReplySubmit={handleReply}
              submitting={submitting}
              onTimestampClick={onTimestampClick}
            />
          ))
        )}
      </div>
    </div>
  );
}

/* ── Single Comment ──────────────────────────── */
function CommentItem({
  comment,
  currentUserId,
  onLike,
  onDelete,
  onReply,
  replyTo,
  onReplySubmit,
  submitting,
  onTimestampClick,
  isReply = false,
}: {
  comment: CommentData;
  currentUserId?: string | null;
  onLike: (id: string) => void;
  onDelete: (id: string) => void;
  onReply: (id: string) => void;
  replyTo: string | null;
  onReplySubmit: (parentId: string, content: string) => void;
  submitting: boolean;
  onTimestampClick?: (time: number) => void;
  isReply?: boolean;
}) {
  const [spoilerRevealed, setSpoilerRevealed] = useState(false);
  const [localReplyContent, setLocalReplyContent] = useState("");
  const liked = currentUserId ? comment.likes.some((l) => l.userId === currentUserId) : false;
  const isOwn = currentUserId === comment.userId;

  return (
    <div className={`${isReply ? "pl-10 bg-white/[0.01]" : "p-4"}`}>
      <div className={isReply ? "p-3" : ""}>
        {/* Header */}
        <div className="flex items-start gap-3">
          {/* Avatar */}
          {comment.user.image ? (
            <img
              src={comment.user.image}
              alt={comment.user.name || ""}
              className="w-8 h-8 rounded-full object-cover shrink-0"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-[#ff5500]/15 flex items-center justify-center text-xs font-bold text-[#ff5500] shrink-0">
              {(comment.user.name || "?")[0].toUpperCase()}
            </div>
          )}

          <div className="flex-1 min-w-0">
            {/* Name + time */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-white">
                {comment.user.name || "Anonymous"}
              </span>
              <span className="text-[10px] text-white/25">
                {timeAgo(comment.createdAt)}
              </span>
              {comment.timestamp !== null && (
                <button
                  type="button"
                  onClick={() => onTimestampClick?.(comment.timestamp!)}
                  className="flex items-center gap-1 text-[10px] text-[#ff5500] hover:text-[#ff6600] font-bold transition-colors"
                >
                  <Clock className="w-2.5 h-2.5" />
                  {formatTimestamp(comment.timestamp)}
                </button>
              )}
            </div>

            {/* Content */}
            {comment.isSpoiler && !spoilerRevealed ? (
              <button
                type="button"
                onClick={() => setSpoilerRevealed(true)}
                className="mt-1.5 flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow-500/8 border border-yellow-500/15 text-yellow-400 text-xs font-medium hover:bg-yellow-500/15 transition-all"
              >
                <EyeOff className="w-3.5 h-3.5" />
                Spoiler — Click to reveal
              </button>
            ) : (
              <p className={`mt-1.5 text-[13px] leading-relaxed whitespace-pre-wrap ${
                comment.isSpoiler ? "text-yellow-200/70" : "text-white/70"
              }`}>
                {comment.content}
                {comment.isSpoiler && (
                  <button
                    type="button"
                    onClick={() => setSpoilerRevealed(false)}
                    className="ml-2 inline-flex items-center text-[10px] text-yellow-500/60 hover:text-yellow-400"
                  >
                    <Eye className="w-3 h-3 mr-0.5" /> hide
                  </button>
                )}
              </p>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3 mt-2">
              <button
                type="button"
                onClick={() => onLike(comment.id)}
                disabled={!currentUserId}
                className={`flex items-center gap-1 text-[11px] font-medium transition-colors ${
                  liked
                    ? "text-red-400"
                    : "text-white/25 hover:text-white/50"
                } disabled:cursor-not-allowed`}
              >
                <Heart className={`w-3.5 h-3.5 ${liked ? "fill-current" : ""}`} />
                {comment.likes.length > 0 && comment.likes.length}
              </button>

              {!isReply && currentUserId && (
                <button
                  type="button"
                  onClick={() => onReply(comment.id)}
                  className="flex items-center gap-1 text-[11px] text-white/25 hover:text-white/50 font-medium transition-colors"
                >
                  <CornerDownRight className="w-3.5 h-3.5" />
                  Reply
                </button>
              )}

              {isOwn && (
                <button
                  type="button"
                  onClick={() => onDelete(comment.id)}
                  className="flex items-center gap-1 text-[11px] text-white/20 hover:text-red-400 font-medium transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Reply form */}
            {replyTo === comment.id && (
              <div className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={localReplyContent}
                  onChange={(e) => setLocalReplyContent(e.target.value)}
                  placeholder="Write a reply..."
                  maxLength={2000}
                  className="flex-1 bg-white/[0.04] border border-white/8 rounded-lg px-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-[#ff5500]/40 transition-all"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      onReplySubmit(comment.id, localReplyContent);
                      setLocalReplyContent("");
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    onReplySubmit(comment.id, localReplyContent);
                    setLocalReplyContent("");
                  }}
                  disabled={!localReplyContent.trim() || submitting}
                  className="px-3 py-2 rounded-lg bg-[#ff5500] text-white text-xs font-bold hover:bg-[#e64d00] disabled:opacity-40 transition-all"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Nested replies */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="border-t border-white/[0.03]">
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              currentUserId={currentUserId}
              onLike={onLike}
              onDelete={onDelete}
              onReply={onReply}
              replyTo={replyTo}
              onReplySubmit={onReplySubmit}
              submitting={submitting}
              onTimestampClick={onTimestampClick}
              isReply
            />
          ))}
        </div>
      )}
    </div>
  );
}
