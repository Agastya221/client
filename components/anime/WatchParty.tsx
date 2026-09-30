"use client";

import { randomId } from "@/lib/random-id";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Crown,
  MessageCircle,
  RefreshCw,
  Send,
  Users,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";

export interface PartyMember {
  id: string;
  name: string;
  isHost?: boolean;
  joinedAt: string;
}

export interface PartyEvent {
  id: string;
  memberId: string;
  memberName: string;
  payload: Record<string, unknown>;
  ts: string;
}

export interface WatchPartyCallbacks {
  onPlay?: (time: number) => void;
  onPause?: (time: number) => void;
  onSeek?: (time: number) => void;
  onEpisodeChange: (episodeNumber: number, provider?: string, dubbed?: boolean, server?: string) => void;
  onServerChange?: (provider: string, dubbed: boolean, server?: string) => void;
}

interface WatchPartyProps {
  roomCode: string;
  memberId: string;
  memberName: string;
  isHost: boolean;
  accentColor?: string;
  currentTime: number;
  isPlaying: boolean;
  currentEpisode: number;
  callbacks: WatchPartyCallbacks;
  onLeave: () => void;
}

interface ChatMessage {
  id: string;
  memberId: string;
  memberName: string;
  text: string;
  ts: string;
  isSystem?: boolean;
}

type ConnState = "connecting" | "connected" | "disconnected" | "error";

function initMemberId(): string {
  if (typeof window === "undefined") return "";
  const key = "watch-party-member-id";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = randomId();
    sessionStorage.setItem(key, id);
  }
  return id;
}

function initMemberName(): string {
  if (typeof window === "undefined") return "Guest";
  return localStorage.getItem("watch-party-member-name") || `Guest${Math.floor(Math.random() * 9000) + 1000}`;
}

export { initMemberId, initMemberName };

export default function WatchParty({
  roomCode,
  memberId,
  memberName,
  isHost,
  accentColor = "#ff5500",
  currentTime,
  isPlaying,
  currentEpisode,
  callbacks,
  onLeave,
}: WatchPartyProps) {
  const [connState, setConnState] = useState<ConnState>("connecting");
  const [members, setMembers] = useState<PartyMember[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [panelOpen, setPanelOpen] = useState(true);
  const [chatOpen, setChatOpen] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [episodeCountdown, setEpisodeCountdown] = useState<number | null>(null);
  const [pendingEpisode, setPendingEpisode] = useState<number | null>(null);
  const [isSynced, setIsSynced] = useState(true);
  const [remoteTime, setRemoteTime] = useState<number | null>(null);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localIgnoreRef = useRef<Set<string>>(new Set());

  const addSystemMessage = useCallback((text: string) => {
    setChat((prev) => [
      ...prev,
      { id: randomId(), memberId: "system", memberName: "System", text, ts: new Date().toISOString(), isSystem: true },
    ]);
  }, []);

  const broadcastEvent = useCallback(
    async (type: string, payload: Record<string, unknown>) => {
      const key = `${type}-${Date.now()}`;
      localIgnoreRef.current.add(key);
      await fetch("/api/watch-party/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: roomCode, memberId, memberName, type, payload }),
      }).catch(() => undefined);
    },
    [roomCode, memberId, memberName]
  );

  // SSE connection
  // Refs to prevent SSE reconnection when player state updates
  const isHostRef = useRef(isHost);
  const isPlayingRef = useRef(isPlaying);
  const currentTimeRef = useRef(currentTime);
  const currentEpisodeRef = useRef(currentEpisode);
  const callbacksRef = useRef(callbacks);
  const chatOpenRef = useRef(chatOpen);
  const broadcastEventRef = useRef(broadcastEvent);

  useEffect(() => { isHostRef.current = isHost; }, [isHost]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);
  useEffect(() => { currentEpisodeRef.current = currentEpisode; }, [currentEpisode]);
  useEffect(() => { callbacksRef.current = callbacks; }, [callbacks]);
  useEffect(() => { chatOpenRef.current = chatOpen; }, [chatOpen]);
  useEffect(() => { broadcastEventRef.current = broadcastEvent; }, [broadcastEvent]);

  // SSE connection
  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    setConnState("connecting");

    const es = new EventSource(
      `/api/watch-party/stream?code=${roomCode}&memberId=${memberId}`
    );
    eventSourceRef.current = es;

    es.addEventListener("connected", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as {
        error?: string;
        room?: { members: PartyMember[]; isPlaying: boolean; currentTime: number; episodeNumber: number };
      };

      if (data.error || !data.room) {
        es.close();
        addSystemMessage("This Watch Party room has been closed.");
        onLeave();
        return;
      }

      setConnState("connected");
      setMembers(data.room.members);
      addSystemMessage(`Connected to room ${roomCode}`);
      // If host, broadcast current state so new joiner syncs
      if (isHostRef.current) {
        setTimeout(() => {
          broadcastEventRef.current(isPlayingRef.current ? "play" : "pause", { time: currentTimeRef.current });
        }, 500);
      } else {
        // Non-host: accept host's state with retry to ensure player is mounted
        setRemoteTime(data.room.currentTime);
        if (data.room.episodeNumber !== currentEpisodeRef.current) {
          callbacksRef.current.onEpisodeChange(data.room.episodeNumber);
        }

        // The player may not be mounted yet (setPlayerActivated triggers a render).
        // Retry sync up to 5 times with increasing delay until a <video> element appears.
        const syncTime = data.room.currentTime;
        const syncPlaying = data.room.isPlaying;
        let retryCount = 0;
        const maxRetries = 5;

        const attemptSync = () => {
          if (syncPlaying) {
            callbacksRef.current.onPlay?.(syncTime);
          } else {
            callbacksRef.current.onPause?.(syncTime);
          }

          // Check if the player actually mounted
          const video = document.querySelector("video");
          if (!video && retryCount < maxRetries) {
            retryCount++;
            setTimeout(attemptSync, 800 * retryCount);
          }
        };

        // First attempt after a short delay to let React mount the player
        setTimeout(attemptSync, 1200);
      }
    });

    es.addEventListener("play", (e) => {
      const ev = JSON.parse((e as MessageEvent).data) as PartyEvent;
      if (ev.memberId === memberId) return;
      const time = (ev.payload.time as number) ?? 0;
      setRemoteTime(time);
      callbacksRef.current.onPlay?.(time);
      setIsSynced(true);
    });

    es.addEventListener("pause", (e) => {
      const ev = JSON.parse((e as MessageEvent).data) as PartyEvent;
      if (ev.memberId === memberId) return;
      const time = (ev.payload.time as number) ?? 0;
      setRemoteTime(time);
      callbacksRef.current.onPause?.(time);
      setIsSynced(true);
    });

    es.addEventListener("seek", (e) => {
      const ev = JSON.parse((e as MessageEvent).data) as PartyEvent;
      if (ev.memberId === memberId) return;
      const time = (ev.payload.time as number) ?? 0;
      setRemoteTime(time);
      callbacksRef.current.onSeek?.(time);
      setIsSynced(true);
    });

    es.addEventListener("episode", (e) => {
      const ev = JSON.parse((e as MessageEvent).data) as PartyEvent;
      if (ev.memberId === memberId) return;
      const epNum = ev.payload.episodeNumber as number;
      const provider = ev.payload.provider as string | undefined;
      const dubbed = ev.payload.dubbed as boolean | undefined;
      const server = ev.payload.server as string | undefined;
      setPendingEpisode(epNum);
      callbacksRef.current.onEpisodeChange(epNum, provider, dubbed, server);
      addSystemMessage(`${ev.memberName} changed to Episode ${epNum}${provider ? ` (${provider})` : ""}`);
    });

    es.addEventListener("server", (e) => {
      const ev = JSON.parse((e as MessageEvent).data) as PartyEvent;
      if (ev.memberId === memberId) return;
      const provider = (ev.payload.provider as string) || "";
      const dubbed = Boolean(ev.payload.dubbed);
      const server = ev.payload.server as string | undefined;
      addSystemMessage(`${ev.memberName} changed server (${provider || "default"})`);
      callbacksRef.current.onServerChange?.(provider, dubbed, server);
    });

    es.addEventListener("chat", (e) => {
      const ev = JSON.parse((e as MessageEvent).data) as PartyEvent;
      setChat((prev) => [
        ...prev,
        { id: ev.id, memberId: ev.memberId, memberName: ev.memberName, text: ev.payload.text as string, ts: ev.ts },
      ]);
      if (!chatOpenRef.current) setUnreadCount((n) => n + 1);
    });

    es.addEventListener("join", (e) => {
      const ev = JSON.parse((e as MessageEvent).data) as PartyEvent;
      if (ev.memberId !== memberId) {
        addSystemMessage(`${ev.payload.memberName as string} joined the room`);
      }
    });

    es.addEventListener("leave", (e) => {
      const ev = JSON.parse((e as MessageEvent).data) as PartyEvent;
      addSystemMessage(`${ev.payload.memberName as string} left the room`);
      setMembers((prev) => prev.filter((m) => m.id !== ev.memberId));
    });

    es.addEventListener("room_closed", (e) => {
      const ev = JSON.parse((e as MessageEvent).data) as PartyEvent;
      es.close();
      addSystemMessage(`Room closed: ${ev.memberName || "Host"} has left`);
      onLeave();
    });

    es.addEventListener("error", () => {
      es.close();
      setConnState("disconnected");
      reconnectTimer.current = setTimeout(connect, 3000);
    });
  }, [roomCode, memberId, addSystemMessage]);

  useEffect(() => {
    connect();
    return () => {
      eventSourceRef.current?.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [connect]);

  // Episode countdown
  useEffect(() => {
    if (episodeCountdown === null || pendingEpisode === null) return;
    if (episodeCountdown === 0) {
      callbacks.onEpisodeChange(pendingEpisode);
      setEpisodeCountdown(null);
      setPendingEpisode(null);
      return;
    }
    const t = setTimeout(() => setEpisodeCountdown((n) => (n ?? 1) - 1), 1000);
    return () => clearTimeout(t);
  }, [episodeCountdown, pendingEpisode, callbacks]);

  // Scroll chat to bottom inside chat container only (prevents viewport scroll)
  useEffect(() => {
    const chatContainer = chatEndRef.current?.parentElement;
    if (chatContainer) {
      chatContainer.scrollTo({
        top: chatContainer.scrollHeight,
        behavior: "smooth"
      });
    }
  }, [chat]);

  // Clear unread when chat is opened
  useEffect(() => {
    if (chatOpen) setUnreadCount(0);
  }, [chatOpen]);

  // Desync detection (non-host only)
  useEffect(() => {
    if (isHost || remoteTime === null) return;
    const drift = Math.abs(currentTime - remoteTime);
    setIsSynced(drift <= 4 || !isPlaying);
  }, [currentTime, remoteTime, isHost, isPlaying]);

  const sendChat = () => {
    const text = chatInput.trim();
    if (!text) return;
    setChatInput("");
    setChat((prev) => [
      ...prev,
      { id: randomId(), memberId, memberName, text, ts: new Date().toISOString() },
    ]);
    broadcastEvent("chat", { text });
  };

  const handleResync = () => {
    if (remoteTime !== null) {
      callbacks.onSeek?.(remoteTime);
      setIsSynced(true);
    }
  };

  const handleLeave = async () => {
    eventSourceRef.current?.close();
    await fetch(`/api/watch-party/join?code=${roomCode}&memberId=${memberId}&memberName=${encodeURIComponent(memberName)}`, {
      method: "DELETE",
    }).catch(() => undefined);
    onLeave();
  };

  return (
    <div className="watch-party-panel rounded-2xl border border-white/10 bg-[#0e0f11] overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2.5"
        style={{ background: `linear-gradient(90deg, ${accentColor}10, transparent)` }}
      >
        <div className="flex items-center gap-2">
          <div className="relative flex h-2 w-2">
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
              style={{ backgroundColor: connState === "connected" ? "#4ade80" : "#ef4444" }}
            />
            <span
              className="relative inline-flex h-2 w-2 rounded-full"
              style={{ backgroundColor: connState === "connected" ? "#22c55e" : connState === "connecting" ? "#f59e0b" : "#ef4444" }}
            />
          </div>
          <span className="text-[11px] font-bold text-white/80">
            Room <span style={{ color: accentColor }}>{roomCode}</span>
          </span>
          {connState === "connected" ? (
            <Wifi className="h-3 w-3 text-white/25" />
          ) : (
            <WifiOff className="h-3 w-3 text-red-400/60" />
          )}
          {isHost && (
            <span
              className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider"
              style={{ background: `${accentColor}22`, color: accentColor }}
            >
              <Crown className="h-2.5 w-2.5" /> Host
            </span>
          )}
        </div>
        {confirmingLeave ? (
          <div className="flex items-center gap-1.5 text-[10px] animate-message-in">
            <span className="text-red-400 font-bold tracking-wide">Leave?</span>
            <button
              type="button"
              onClick={handleLeave}
              className="rounded bg-red-600/90 hover:bg-red-700 px-2 py-0.5 font-extrabold text-white text-[9px] transition-colors btn-press-active"
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => setConfirmingLeave(false)}
              className="rounded bg-white/10 hover:bg-white/20 px-2 py-0.5 font-extrabold text-white/70 text-[9px] transition-colors btn-press-active"
            >
              No
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPanelOpen((o) => !o)}
              className="flex h-6 w-6 items-center justify-center rounded-md text-white/40 hover:text-white"
            >
              {panelOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingLeave(true)}
              title="Leave room"
              className="flex h-6 w-6 items-center justify-center rounded-md text-white/30 hover:text-red-400"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {panelOpen && (
        <>
          {/* Desync nudge */}
          {!isSynced && !isHost && (
            <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] bg-amber-500/[0.07] px-3 py-2">
              <p className="text-[11px] text-amber-300/90">You&apos;re out of sync with the host</p>
              <button
                type="button"
                onClick={handleResync}
                className="flex items-center gap-1.5 rounded-lg bg-amber-500/20 px-2.5 py-1 text-[10px] font-bold text-amber-300 transition hover:bg-amber-500/30"
              >
                <RefreshCw className="h-3 w-3" /> Resync
              </button>
            </div>
          )}

          {/* Episode countdown overlay */}
          {episodeCountdown !== null && (
            <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] bg-blue-500/[0.07] px-3 py-2">
              <p className="text-[11px] text-blue-300">Switching to Episode {pendingEpisode} in {episodeCountdown}s…</p>
            </div>
          )}

          {/* Sync indicator for host */}
          {isHost && (
            <div className="flex items-center gap-1.5 border-b border-white/[0.06] px-3 py-2">
              <CheckCircle2 className="h-3 w-3 text-emerald-400" />
              <p className="text-[11px] text-white/40">You&apos;re the host — your player controls the room</p>
            </div>
          )}

          {/* Members */}
          <div className="border-b border-white/[0.06] px-3 py-2.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-white/35">
                <Users className="h-3 w-3" /> Members ({members.length})
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {members.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 party-member-enter"
                >
                  {m.isHost && <Crown className="h-2.5 w-2.5 shrink-0" style={{ color: accentColor }} />}
                  <span className={`text-[11px] font-semibold ${m.id === memberId ? "text-white" : "text-white/65"}`}>
                    {m.name}
                    {m.id === memberId ? " (you)" : ""}
                  </span>
                </div>
              ))}
              {members.length === 0 && (
                <p className="text-[11px] text-white/25">Waiting for members…</p>
              )}
            </div>
          </div>

          {/* Chat */}
          <div>
            <button
              type="button"
              onClick={() => setChatOpen((o) => !o)}
              className="flex w-full items-center justify-between px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white/35 hover:text-white/55"
            >
              <span className="flex items-center gap-1.5">
                <MessageCircle className="h-3 w-3" />
                Chat
                {unreadCount > 0 && (
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[9px] font-black text-white"
                    style={{ background: accentColor }}
                  >
                    {unreadCount}
                  </span>
                )}
              </span>
              {chatOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>

            {chatOpen && (
              <div className="flex flex-col gap-0">
                <div className="h-[140px] overflow-y-auto px-3 py-2 space-y-1.5 hide-scrollbar">
                  {chat.map((msg) => (
                    <div key={msg.id} className="animate-message-in">
                      {msg.isSystem ? (
                        <p className="text-[10px] text-white/25 text-center italic">{msg.text}</p>
                      ) : (
                        <div className={`flex gap-1.5 ${msg.memberId === memberId ? "flex-row-reverse" : ""}`}>
                          <div
                            className={`max-w-[85%] rounded-xl px-2.5 py-1.5 text-[11px] leading-snug ${
                              msg.memberId === memberId
                                ? "rounded-tr-sm text-white"
                                : "rounded-tl-sm bg-white/[0.06] text-white/80"
                            }`}
                            style={msg.memberId === memberId ? { background: accentColor } : undefined}
                          >
                            {msg.memberId !== memberId && (
                              <p className="mb-0.5 text-[9px] font-bold opacity-60">{msg.memberName}</p>
                            )}
                            {msg.text}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>

                <div className="flex items-center gap-2 border-t border-white/[0.06] px-3 py-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") sendChat(); }}
                    placeholder="Say something…"
                    maxLength={200}
                    className="flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-white placeholder-white/25 outline-none focus:border-white/20"
                  />
                  <button
                    type="button"
                    onClick={sendChat}
                    disabled={!chatInput.trim()}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-30 btn-press-active"
                    style={{ background: accentColor }}
                  >
                    <Send className="h-3.5 w-3.5 text-white" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
