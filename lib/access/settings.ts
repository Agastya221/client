/**
 * Settings the admin panel changes at runtime: how many members are let in, which codes are
 * withdrawn, and the "watching now" counter. Stored as one small JSON value in Workers KV
 * (binding APP_CACHE_KV); locally in the file named by SITE_SETTINGS_FILE. With nothing
 * stored, every value falls back to the environment variables, so the site works unchanged
 * until someone uses the panel.
 *
 * Runs in the worker, so it uses no Next.js imports.
 */
import { getAccessConfig, type AccessConfig } from "./invite";

export const SETTINGS_KEY = "site-settings:v1";
/** How long a worker isolate keeps the settings before asking KV again. Keeps KV reads tiny. */
const CACHE_MS = 60_000;

export interface WatchingSettings {
  enabled: boolean;
  /** Quietest hour's count and busiest hour's count. */
  min: number;
  max: number;
  /** IANA zone the daily rhythm follows, e.g. "Asia/Kolkata". */
  timezone: string;
}

export interface SiteSettings {
  maxMembers?: number;
  revoked?: number[];
  watching?: Partial<WatchingSettings>;
}

export const DEFAULT_WATCHING: WatchingSettings = { enabled: true, min: 6, max: 34, timezone: "Asia/Kolkata" };

interface KvLike {
  get(key: string, type: "text"): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

type EnvLike = Record<string, unknown> | undefined;

function kvOf(env: EnvLike): KvLike | null {
  const kv = env?.APP_CACHE_KV as KvLike | undefined;
  return kv && typeof kv.get === "function" ? kv : null;
}

function fileOf(env: EnvLike): string | null {
  const path = env?.SITE_SETTINGS_FILE;
  return typeof path === "string" && path.trim() ? path.trim() : null;
}

/** Where settings live for this environment, for the admin panel to show. */
export function settingsBackend(env: EnvLike): "kv" | "file" | "none" {
  return kvOf(env) ? "kv" : fileOf(env) ? "file" : "none";
}

let cached: { at: number; value: SiteSettings } | null = null;

export async function readSiteSettings(env: EnvLike, options: { fresh?: boolean } = {}): Promise<SiteSettings> {
  const kv = kvOf(env);
  const file = fileOf(env);
  if (!kv && !file) return {};
  if (!options.fresh && cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  let value: SiteSettings = {};
  try {
    let raw: string | null = null;
    if (kv) raw = await kv.get(SETTINGS_KEY, "text");
    else if (file) {
      const fs = await import("node:fs/promises");
      raw = await fs.readFile(file, "utf8").catch(() => null);
    }
    if (raw) value = sanitizeSettings(JSON.parse(raw));
  } catch {
    // A KV hiccup must never take the site down: keep the last good value, else use the environment.
    return cached?.value ?? {};
  }
  cached = { at: Date.now(), value };
  return value;
}

export async function writeSiteSettings(env: EnvLike, settings: SiteSettings): Promise<void> {
  const kv = kvOf(env);
  const file = fileOf(env);
  const body = JSON.stringify(sanitizeSettings(settings));
  if (kv) await kv.put(SETTINGS_KEY, body);
  else if (file) {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, body, "utf8");
  } else {
    throw new Error("No settings storage: bind APP_CACHE_KV (Cloudflare) or set SITE_SETTINGS_FILE (local).");
  }
  cached = null;
}

const int = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? Math.round(value) : undefined;

/** Keeps only well-formed values, whatever was stored or submitted. */
export function sanitizeSettings(input: unknown): SiteSettings {
  const source = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out: SiteSettings = {};
  const max = int(source.maxMembers);
  if (max !== undefined && max >= 1 && max <= 10000) out.maxMembers = max;
  if (Array.isArray(source.revoked)) {
    out.revoked = [...new Set(source.revoked.map(int).filter((n): n is number => n !== undefined && n > 0))].sort((a, b) => a - b);
  }
  const w = source.watching && typeof source.watching === "object" ? (source.watching as Record<string, unknown>) : null;
  if (w) {
    const watching: Partial<WatchingSettings> = {};
    if (typeof w.enabled === "boolean") watching.enabled = w.enabled;
    const min = int(w.min);
    const top = int(w.max);
    if (min !== undefined && min >= 0 && min <= 10000) watching.min = min;
    if (top !== undefined && top >= 0 && top <= 10000) watching.max = top;
    if (typeof w.timezone === "string" && isTimezone(w.timezone)) watching.timezone = w.timezone;
    out.watching = watching;
  }
  return out;
}

export function isTimezone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** The environment's access config with whatever the admin panel has saved laid over it. */
export async function resolveAccessConfig(env: EnvLike): Promise<AccessConfig> {
  const base = getAccessConfig(env);
  const stored = await readSiteSettings(env);
  return {
    ...base,
    maxMembers: stored.maxMembers ?? base.maxMembers,
    revoked: stored.revoked ? new Set(stored.revoked) : base.revoked,
  };
}

export function resolveWatching(stored: SiteSettings): WatchingSettings {
  return { ...DEFAULT_WATCHING, ...stored.watching };
}
