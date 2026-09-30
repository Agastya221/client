"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Eye, KeyRound, Lock, LogOut, Save, Users } from "lucide-react";
import { animeWatching, siteWatching } from "@/lib/watching";

interface PanelState {
  gateOn: boolean;
  storage: "kv" | "file" | "none";
  maxMembers: number;
  revoked: number[];
  watching: { enabled: boolean; min: number; max: number; timezone: string };
  codes: { member: number; code: string }[];
}

const ZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Asia/Tokyo", "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles", "UTC"];

const input =
  "w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500";
const card = "rounded-2xl border border-white/10 bg-white/[0.03] p-5";
const label = "mb-1.5 block text-xs font-medium text-neutral-300";

async function api(body?: unknown) {
  const res = await fetch("/api/admin/access", body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export default function AdminAccessPage() {
  const [state, setState] = useState<PanelState | null>(null);
  const [locked, setLocked] = useState<string | null>(null); // message shown on the login card
  const [password, setPassword] = useState("");
  const [max, setMax] = useState("50");
  const [revoked, setRevoked] = useState("");
  const [watching, setWatching] = useState({ enabled: true, min: "6", max: "34", timezone: "Asia/Kolkata" });
  const [notice, setNotice] = useState("");
  const [ready, setReady] = useState(false); // stops the login card flashing while the first load runs
  const [copied, setCopied] = useState<number | "all" | null>(null);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    const { ok, status, data } = await api();
    if (!ok) {
      setState(null);
      setLocked(status === 401 ? "" : data.error || "Something went wrong.");
      return;
    }
    const next = data as PanelState;
    setState(next);
    setLocked(null);
    setMax(String(next.maxMembers));
    setRevoked(next.revoked.join(", "));
    setWatching({ enabled: next.watching.enabled, min: String(next.watching.min), max: String(next.watching.max), timezone: next.watching.timezone });
  }, []);

  useEffect(() => { void load().finally(() => setReady(true)); }, [load]);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 5000);
    return () => clearInterval(timer);
  }, []);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    const { ok, data } = await api({ action: "login", password });
    if (!ok) { setLocked(data.error || "Wrong password."); return; }
    setPassword("");
    await load();
  }

  async function save() {
    const { ok, data } = await api({
      action: "save",
      settings: {
        maxMembers: Number(max),
        revoked: revoked.split(/[\s,]+/).filter(Boolean).map(Number),
        watching: { enabled: watching.enabled, min: Number(watching.min), max: Number(watching.max), timezone: watching.timezone },
      },
    });
    setNotice(ok ? "Saved. The site picks this up within about a minute." : data.error || "Could not save.");
    if (ok) await load();
  }

  async function copy(text: string, key: number | "all") {
    try { await navigator.clipboard.writeText(text); } catch { /* clipboard blocked on plain http; select manually */ }
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  const revokedSet = new Set(revoked.split(/[\s,]+/).filter(Boolean).map(Number));
  const preview = {
    enabled: watching.enabled,
    min: Number(watching.min) || 0,
    max: Math.min(Number(watching.max) || 0, Math.floor((Number(max) || 50) * 0.8)),
    timezone: watching.timezone,
  };

  if (!state && !ready) return <main className="min-h-screen bg-[#0a0a0f]" />;

  if (!state) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0a0a0f] p-4 text-white">
        <form onSubmit={login} className={`${card} w-full max-w-sm text-center`}>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-purple-500/30 bg-purple-500/10 text-purple-400">
            <Lock className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold">Admin</h1>
          {locked ? <p className="mt-3 text-sm text-red-400">{locked}</p> : <p className="mt-2 text-sm text-neutral-400">Enter the admin password.</p>}
          {locked === null || locked === "" || /password|attempts/i.test(locked) ? (
            <>
              <input className={`${input} mt-4`} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required />
              <button className="mt-3 w-full rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 py-2.5 text-sm font-medium" type="submit">Sign in</button>
            </>
          ) : null}
        </form>
      </main>
    );
  }

  const allCodes = state.codes.filter((c) => !revokedSet.has(c.member) && c.member <= (Number(max) || state.maxMembers));

  return (
    <main className="min-h-screen bg-[#0a0a0f] px-4 pb-10 pt-24 text-white">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Access &amp; watching</h1>
            <p className="text-xs text-neutral-400">
              Invite gate is <b className={state.gateOn ? "text-green-400" : "text-amber-400"}>{state.gateOn ? "ON" : "OFF"}</b>
              {" · "}settings stored in {state.storage === "kv" ? "Cloudflare KV" : state.storage === "file" ? "a local file" : "nowhere (read-only)"}
            </p>
          </div>
          <button onClick={async () => { await api({ action: "logout" }); setState(null); setLocked(""); }} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs text-neutral-300 hover:bg-white/5">
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </header>

        {state.storage === "none" ? (
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
            Nothing to save to yet: bind APP_CACHE_KV on Cloudflare (or set SITE_SETTINGS_FILE locally). You can still copy codes below.
          </p>
        ) : null}

        <section className={card}>
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold"><Users className="h-4 w-4 text-purple-400" /> Members</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label}>Spots open (how many members can get in)</label>
              <input className={input} inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value)} />
              <p className="mt-1 text-[11px] text-neutral-500">Raise this to let more people in. Codes 1 to this number work.</p>
            </div>
            <div>
              <label className={label}>Withdrawn members (comma separated)</label>
              <input className={input} value={revoked} onChange={(e) => setRevoked(e.target.value)} placeholder="e.g. 7, 12" />
              <p className="mt-1 text-[11px] text-neutral-500">Their code stops working and they are signed out.</p>
            </div>
          </div>
        </section>

        <section className={card}>
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold"><Eye className="h-4 w-4 text-purple-400" /> &ldquo;Watching&rdquo; counter</h2>
          <label className="mb-4 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={watching.enabled} onChange={(e) => setWatching({ ...watching, enabled: e.target.checked })} className="h-4 w-4 accent-purple-500" />
            Show it on watch pages
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={label}>Quietest hour</label>
              <input className={input} inputMode="numeric" value={watching.min} onChange={(e) => setWatching({ ...watching, min: e.target.value })} />
            </div>
            <div>
              <label className={label}>Busiest hour</label>
              <input className={input} inputMode="numeric" value={watching.max} onChange={(e) => setWatching({ ...watching, max: e.target.value })} />
            </div>
            <div>
              <label className={label}>Time zone</label>
              <select className={input} value={watching.timezone} onChange={(e) => setWatching({ ...watching, timezone: e.target.value })}>
                {(ZONES.includes(watching.timezone) ? ZONES : [watching.timezone, ...ZONES]).map((z) => <option key={z} value={z}>{z}</option>)}
              </select>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-neutral-500">
            Follows a daily rhythm: busiest late evening, quietest before dawn. The peak is capped at 80% of the open spots.
          </p>
          <div className="mt-4 flex items-center gap-6 rounded-xl border border-white/10 bg-black/30 p-3 text-sm">
            <span className="text-neutral-400">Right now it would show:</span>
            <span><b className="text-lime-400">{siteWatching(now, preview)}</b> <span className="text-neutral-500">site-wide</span></span>
            <span><b className="text-lime-400">{animeWatching("anilist~21", now, preview)}</b> <span className="text-neutral-500">on One Piece</span></span>
          </div>
        </section>

        <div className="flex items-center gap-3">
          <button onClick={save} disabled={state.storage === "none"} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-5 py-2.5 text-sm font-medium disabled:opacity-40">
            <Save className="h-4 w-4" /> Save changes
          </button>
          {notice ? <span className="text-sm text-neutral-300">{notice}</span> : null}
        </div>

        <section className={card}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-bold"><KeyRound className="h-4 w-4 text-purple-400" /> Invite codes ({allCodes.length} active)</h2>
            <button onClick={() => copy(allCodes.map((c) => c.code).join("\n"), "all")} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-neutral-200 hover:bg-white/5">
              {copied === "all" ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />} Copy all
            </button>
          </div>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {state.codes.slice(0, Math.max(Number(max) || 0, 0) || undefined).map(({ member, code }) => {
              const off = revokedSet.has(member);
              return (
                <li key={member} className={`flex items-center justify-between rounded-lg border border-white/5 bg-black/30 px-3 py-2 font-mono text-xs ${off ? "opacity-40 line-through" : ""}`}>
                  <span className="select-all">{code}</span>
                  <button onClick={() => copy(code, member)} aria-label={`Copy code ${member}`} className="ml-3 text-neutral-400 hover:text-white">
                    {copied === member ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </main>
  );
}
