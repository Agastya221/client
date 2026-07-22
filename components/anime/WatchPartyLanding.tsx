"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { LogIn, Plus, Users, Wifi, Zap, Search, Play, Clock, RefreshCw } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

interface ActiveRoom {
  code: string;
  animeId: string;
  animeTitle: string;
  animePoster: string | null;
  episodeNumber: number;
  isPlaying: boolean;
  memberCount: number;
  createdAt: string;
  lastActivityAt: string;
}

interface AnimeSearchResult {
  id: string;
  title: string;
  poster: string;
  totalEpisodes: number;
}

export default function WatchPartyLanding({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Active rooms
  const [rooms, setRooms] = useState<ActiveRoom[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);

  // Create room state
  const [createMode, setCreateMode] = useState(false);
  const [animeQuery, setAnimeQuery] = useState("");
  const [animeResults, setAnimeResults] = useState<AnimeSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedAnime, setSelectedAnime] = useState<AnimeSearchResult | null>(null);
  const [createEpisode, setCreateEpisode] = useState(1);
  const [creating, setCreating] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pre-fill code from URL param (?code=ANIM4X)
  useEffect(() => {
    searchParamsPromise.then((params) => {
      const c = typeof params.code === "string" ? params.code : "";
      if (c) setCode(c.toUpperCase());
    });
  }, [searchParamsPromise]);

  // Load active rooms
  const loadRooms = useCallback(() => {
    setRoomsLoading(true);
    fetch("/api/watch-party/rooms")
      .then((r) => r.json())
      .then((data) => setRooms(data as ActiveRoom[]))
      .catch(() => setRooms([]))
      .finally(() => setRoomsLoading(false));
  }, []);

  useEffect(() => { loadRooms(); }, [loadRooms]);

  // Anime search for Create Room
  useEffect(() => {
    if (!animeQuery.trim() || animeQuery.trim().length < 2) {
      setAnimeResults([]);
      return;
    }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(`/api/search-feed?q=${encodeURIComponent(animeQuery.trim())}`);
        if (res.ok) {
          const data = await res.json();
          // search-feed returns { results: [...] } with anime objects
          const list = data.results || data.animes || data || [];
          const results = (Array.isArray(list) ? list : []).slice(0, 8).map((item: Record<string, unknown>) => ({
            id: (item.id as string) || "",
            title: (item.title as string) || (item.name as string) || "",
            poster: (item.poster as string) || (item.image as string) || "",
            totalEpisodes: (item.totalEpisodes as number) || (item.episodes as number) || 0,
          }));
          setAnimeResults(results);
        }
      } catch {
        setAnimeResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 400);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [animeQuery]);

  const handleJoin = async () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 4) { setErrorMsg("Please enter a valid room code"); return; }
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/watch-party/room?code=" + trimmed);
      if (res.status === 404) { setErrorMsg("Room not found or expired"); setStatus("idle"); return; }
      if (!res.ok) throw new Error();
      const room = await res.json() as { animeId: string; animeTitle: string; episodeNumber: number };
      window.location.href = `/anime/${room.animeId}/watch?ep=${room.episodeNumber}&party=${trimmed}`;
    } catch {
      setErrorMsg("Could not find that room. Check the code and try again.");
      setStatus("idle");
    }
  };

  const handleJoinRoom = (room: ActiveRoom) => {
    window.location.href = `/anime/${room.animeId}/watch?ep=${room.episodeNumber}&party=${room.code}`;
  };

  const handleCreateRoom = async () => {
    if (!selectedAnime) return;
    setCreating(true);

    // Generate a memberId for this session
    let memberId = sessionStorage.getItem("watch-party-member-id");
    if (!memberId) { memberId = crypto.randomUUID(); sessionStorage.setItem("watch-party-member-id", memberId); }
    const memberName = localStorage.getItem("watch-party-member-name") || `Guest${Math.floor(Math.random() * 9000) + 1000}`;

    try {
      const res = await fetch("/api/watch-party/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostId: memberId,
          hostName: memberName,
          animeId: selectedAnime.id,
          animeTitle: selectedAnime.title,
          animePoster: selectedAnime.poster || undefined,
          episodeNumber: createEpisode,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json() as { code: string };

      // Save host state
      sessionStorage.setItem("watch-party-active-room-code", data.code);
      sessionStorage.setItem("watch-party-is-host", "true");

      // Navigate to watch page
      window.location.href = `/anime/${selectedAnime.id}/watch?ep=${createEpisode}`;
    } catch {
      setErrorMsg("Failed to create room. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ago`;
  };

  return (
    <section className="relative flex-1 overflow-hidden px-4 py-12 sm:py-20">
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(255,85,0,0.12),transparent)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_40%_30%_at_80%_80%,rgba(82,255,127,0.05),transparent)]" />
        <div
          className="absolute left-[15%] top-[20%] h-72 w-72 rounded-full opacity-[0.06] blur-3xl"
          style={{ background: "#ff5500", animation: "partyPulse 4s ease-in-out infinite" }}
        />
        <div
          className="absolute right-[10%] bottom-[25%] h-56 w-56 rounded-full opacity-[0.04] blur-3xl"
          style={{ background: "#52ff7f", animation: "partyPulse 6s ease-in-out infinite reverse" }}
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-5xl">
        {/* Header */}
        <div className="mb-10 text-center">
          <div className="mb-6 flex justify-center">
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 backdrop-blur-sm">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#ff5500]/20 text-[#ff5500]">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/35">Tatakai</p>
                <p className="text-base font-black text-white">Watch Together</p>
              </div>
            </div>
          </div>
          <h1 className="mb-4 text-3xl font-black leading-tight tracking-tight text-white sm:text-5xl">
            Watch anime
            <span className="block" style={{ color: "#ff5500" }}>with your crew</span>
          </h1>
          <p className="mx-auto max-w-sm text-sm text-white/50 leading-relaxed sm:text-base">
            Create a room, share the code, and watch perfectly in sync — play, pause, seek, and chat together.
          </p>
        </div>

        {/* Join + Create Cards */}
        <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-2">
          {/* Join Card */}
          <div
            className="rounded-2xl border border-white/10 p-5 sm:p-6 backdrop-blur-sm"
            style={{ background: "linear-gradient(135deg, rgba(15,16,18,0.95) 0%, rgba(20,22,24,0.95) 100%)" }}
          >
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                <LogIn className="h-4 w-4" />
              </div>
              <h2 className="text-sm font-bold text-white">Join a Room</h2>
            </div>

            <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-white/40">
              Room Code
            </label>
            <input
              ref={inputRef}
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
              onKeyDown={(e) => { if (e.key === "Enter") handleJoin(); }}
              placeholder="ANIM4X"
              maxLength={6}
              className="mb-3 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-2xl font-black tracking-[0.3em] text-white placeholder-white/20 outline-none transition-all focus:border-[#ff5500]/50 focus:ring-2 focus:ring-[#ff5500]/20"
            />

            {errorMsg && !createMode && (
              <p className="mb-3 rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-[11px] text-red-400">{errorMsg}</p>
            )}

            <button
              type="button"
              onClick={handleJoin}
              disabled={status === "loading" || code.length < 4}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-bold text-white transition-all hover:brightness-110 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #10b981, #059669)", boxShadow: "0 8px 24px rgba(16,185,129,0.25)" }}
            >
              <LogIn className="h-4 w-4" />
              {status === "loading" ? "Finding room…" : "Join Room"}
            </button>
          </div>

          {/* Create Card */}
          <div
            className="rounded-2xl border border-white/10 p-5 sm:p-6 backdrop-blur-sm"
            style={{ background: "linear-gradient(135deg, rgba(15,16,18,0.95) 0%, rgba(20,22,24,0.95) 100%)" }}
          >
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#ff5500]/15 text-[#ff5500]">
                <Plus className="h-4 w-4" />
              </div>
              <h2 className="text-sm font-bold text-white">Create a Room</h2>
            </div>

            {!selectedAnime ? (
              <>
                <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-white/40">
                  Search Anime
                </label>
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                  <input
                    type="text"
                    value={animeQuery}
                    onChange={(e) => setAnimeQuery(e.target.value)}
                    placeholder="Search for an anime..."
                    className="w-full rounded-xl border border-white/10 bg-white/[0.04] pl-10 pr-4 py-3 text-sm text-white placeholder-white/30 outline-none transition-all focus:border-[#ff5500]/50 focus:ring-2 focus:ring-[#ff5500]/20"
                  />
                </div>

                {searchLoading && (
                  <div className="flex items-center justify-center py-4">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-[#ff5500]" />
                  </div>
                )}

                {animeResults.length > 0 && (
                  <div className="max-h-[240px] space-y-1 overflow-y-auto rounded-xl border border-white/[0.06] bg-black/30 p-1">
                    {animeResults.map((anime) => (
                      <button
                        key={anime.id}
                        type="button"
                        onClick={() => { setSelectedAnime(anime); setCreateEpisode(1); }}
                        className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-all hover:bg-white/[0.06]"
                      >
                        {anime.poster && (
                          <Image
                            src={anime.poster}
                            alt={anime.title}
                            width={36}
                            height={50}
                            className="h-[50px] w-[36px] rounded-md object-cover"
                            unoptimized
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold text-white/90">{anime.title}</p>
                          {anime.totalEpisodes > 0 && (
                            <p className="text-[10px] text-white/40">{anime.totalEpisodes} episodes</p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {!searchLoading && animeResults.length === 0 && animeQuery.trim().length >= 2 && (
                  <p className="py-4 text-center text-[11px] text-white/30">No results found</p>
                )}

                {animeQuery.trim().length < 2 && (
                  <p className="py-4 text-center text-[11px] text-white/30">Type at least 2 characters to search</p>
                )}
              </>
            ) : (
              <>
                {/* Selected anime */}
                <div className="mb-4 flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
                  {selectedAnime.poster && (
                    <Image
                      src={selectedAnime.poster}
                      alt={selectedAnime.title}
                      width={40}
                      height={56}
                      className="h-[56px] w-[40px] rounded-lg object-cover"
                      unoptimized
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-white/90">{selectedAnime.title}</p>
                    <p className="text-[10px] text-white/40">
                      {selectedAnime.totalEpisodes > 0 ? `${selectedAnime.totalEpisodes} episodes` : "Anime"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setSelectedAnime(null); setAnimeQuery(""); }}
                    className="rounded-lg bg-white/[0.06] px-2 py-1 text-[10px] font-bold text-white/50 hover:bg-white/[0.1] hover:text-white/70"
                  >
                    Change
                  </button>
                </div>

                <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-white/40">
                  Starting Episode
                </label>
                <input
                  type="number"
                  min={1}
                  max={selectedAnime.totalEpisodes || 999}
                  value={createEpisode}
                  onChange={(e) => setCreateEpisode(Math.max(1, parseInt(e.target.value) || 1))}
                  className="mb-4 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition-all focus:border-[#ff5500]/50 focus:ring-2 focus:ring-[#ff5500]/20"
                />

                <button
                  type="button"
                  onClick={handleCreateRoom}
                  disabled={creating}
                  className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-bold text-white transition-all hover:brightness-110 disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #ff5500, #ff7730)", boxShadow: "0 8px 24px rgba(255,85,0,0.35)" }}
                >
                  <Plus className="h-4 w-4" />
                  {creating ? "Creating…" : "Create Room"}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Features */}
        <div className="mx-auto mt-8 grid max-w-3xl grid-cols-3 gap-3 sm:gap-4">
          {[
            { icon: Wifi, label: "Real-time sync", desc: "Play, pause & seek together" },
            { icon: Users, label: "Up to 20 people", desc: "Invite your whole crew" },
            { icon: Zap, label: "Instant setup", desc: "No account required" },
          ].map(({ icon: Icon, label, desc }) => (
            <div key={label} className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3 text-center">
              <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-[#ff5500]/15 text-[#ff5500]">
                <Icon className="h-4 w-4" />
              </div>
              <p className="text-[11px] font-bold text-white/80">{label}</p>
              <p className="mt-0.5 text-[10px] text-white/35">{desc}</p>
            </div>
          ))}
        </div>

        {/* Active Rooms */}
        <div className="mx-auto mt-12 max-w-3xl">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-black text-white sm:text-lg">
              Active Rooms
              {rooms.length > 0 && (
                <span className="ml-2 inline-flex items-center justify-center rounded-full bg-[#ff5500]/15 px-2 py-0.5 text-[10px] font-bold text-[#ff5500]">
                  {rooms.length}
                </span>
              )}
            </h2>
            <button
              type="button"
              onClick={loadRooms}
              disabled={roomsLoading}
              className="flex items-center gap-1.5 rounded-lg bg-white/[0.04] px-3 py-1.5 text-[11px] font-bold text-white/50 transition-all hover:bg-white/[0.08] hover:text-white/70 disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${roomsLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          {roomsLoading ? (
            <div className="flex items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.02] py-16">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-[#ff5500]" />
            </div>
          ) : rooms.length === 0 ? (
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] py-12 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.04]">
                <Users className="h-5 w-5 text-white/25" />
              </div>
              <p className="text-sm font-bold text-white/40">No active rooms right now</p>
              <p className="mt-1 text-[11px] text-white/25">Be the first to create one!</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {rooms.map((room) => (
                <button
                  key={room.code}
                  type="button"
                  onClick={() => handleJoinRoom(room)}
                  className="group flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3 text-left transition-all hover:border-[#ff5500]/30 hover:bg-white/[0.04] hover:shadow-lg hover:shadow-[#ff5500]/5"
                >
                  {/* Poster */}
                  <div className="relative h-[72px] w-[52px] flex-shrink-0 overflow-hidden rounded-lg bg-white/[0.05]">
                    {room.animePoster ? (
                      <Image
                        src={room.animePoster}
                        alt={room.animeTitle}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-white/20">
                        <Play className="h-4 w-4" />
                      </div>
                    )}
                    {/* Live indicator */}
                    {room.isPlaying && (
                      <div className="absolute left-1 top-1 flex items-center gap-1 rounded bg-red-500/90 px-1 py-0.5">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                        <span className="text-[8px] font-black text-white">LIVE</span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-white/90 group-hover:text-white">
                      {room.animeTitle}
                    </p>
                    <p className="mt-0.5 text-[10px] text-white/40">
                      Episode {room.episodeNumber}
                    </p>
                    <div className="mt-2 flex items-center gap-3">
                      <span className="flex items-center gap-1 text-[10px] text-white/30">
                        <Users className="h-3 w-3" />
                        {room.memberCount} {room.memberCount === 1 ? "viewer" : "viewers"}
                      </span>
                      <span className="flex items-center gap-1 text-[10px] text-white/30">
                        <Clock className="h-3 w-3" />
                        {timeAgo(room.lastActivityAt)}
                      </span>
                    </div>
                  </div>

                  {/* Join badge */}
                  <div className="flex-shrink-0 rounded-lg bg-[#ff5500]/10 px-2.5 py-1.5 text-[10px] font-bold text-[#ff5500] opacity-0 transition-all group-hover:opacity-100">
                    Join →
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
