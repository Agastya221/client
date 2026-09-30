/**
 * Closed-community access: invite codes and the session cookie that a valid code earns.
 *
 * Stateless on purpose — no database table, no KV: an invite code is `TK-<member>-<signature>`
 * and the signature is an HMAC of the member number, so the server can verify a code without
 * ever having stored it. "The first 50 users" is `member <= SITE_MAX_MEMBERS`, so opening the
 * site to more people later is just raising that number. Individual codes can be withdrawn
 * with SITE_REVOKED_MEMBERS.
 *
 * Runs in the Cloudflare worker (worker.ts, before Next.js) and in Next route handlers, so it
 * only uses Web Crypto and no Node or Next.js imports.
 */

export const ACCESS_COOKIE = "tk_access";
export const SESSION_DAYS = 60;

const CODE_PREFIX = "TK";
const SIGNATURE_LENGTH = 8;
// No 0/1/I/O: codes get read out loud and typed on phones.
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** Sessions from the shared "friends" code carry this number plus the code's version. */
export const SHARED_BASE = 900000;
/** Individual invites stop well below SHARED_BASE so the two can never be confused. */
export const MAX_MEMBERS_LIMIT = 10000;

export interface AccessConfig {
  /** False (the default) leaves the site completely open, exactly as before this feature. */
  enabled: boolean;
  secret: string;
  maxMembers: number;
  revoked: ReadonlySet<number>;
  /** One code anyone can use, for a private group. Changing `version` retires the old code. */
  shared: { enabled: boolean; version: number };
}

type EnvLike = Record<string, unknown> | undefined;

function text(env: EnvLike, key: string): string {
  const value = env?.[key];
  return typeof value === "string" ? value.trim() : "";
}

export function getAccessConfig(env: EnvLike): AccessConfig {
  const secret = text(env, "SITE_ACCESS_SECRET") || text(env, "AUTH_SECRET");
  const maxMembers = Number.parseInt(text(env, "SITE_MAX_MEMBERS"), 10);
  const revoked = new Set(
    text(env, "SITE_REVOKED_MEMBERS")
      .split(",")
      .map((part) => Number.parseInt(part.trim(), 10))
      .filter((n) => Number.isInteger(n) && n > 0),
  );
  const flag = text(env, "SITE_ACCESS").toLowerCase();
  return {
    // Needs a secret as well: with none set, the gate could never be passed, so stay open
    // instead of locking everyone out over a missing variable.
    enabled: (flag === "invite" || flag === "on" || flag === "1" || flag === "true") && secret.length > 0,
    secret,
    maxMembers: Number.isInteger(maxMembers) && maxMembers > 0 ? Math.min(maxMembers, MAX_MEMBERS_LIMIT) : 50,
    revoked,
    shared: { enabled: true, version: 1 },
  };
}

const encoder = new TextEncoder();

// Importing the key is the slow part of an HMAC, and the gate signs on every page request
// while the admin panel derives hundreds of codes at once: import once per secret.
const keys = new Map<string, Promise<CryptoKey>>();

export function hmacKey(secret: string): Promise<CryptoKey> {
  let key = keys.get(secret);
  if (!key) {
    key = crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    keys.set(secret, key);
  }
  return key;
}

async function hmac(secret: string, message: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(message)));
}

function toBase32(bytes: Uint8Array, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── Invite codes ────────────────────────────────────────────────────────────

export async function makeInviteCode(secret: string, member: number): Promise<string> {
  const signature = toBase32(await hmac(secret, `invite:${member}`), SIGNATURE_LENGTH);
  return `${CODE_PREFIX}-${String(member).padStart(3, "0")}-${signature}`;
}

// ── The shared friends code ─────────────────────────────────────────────────

const SHARED_PREFIX = "TK-FRIENDS-";

export async function makeSharedCode(secret: string, version: number): Promise<string> {
  return `${SHARED_PREFIX}${toBase32(await hmac(secret, `shared:${version}`), SIGNATURE_LENGTH)}`;
}

/** The member number inside a well-formed code, or null. Says nothing about validity. */
export function memberFromCode(code: string): number | null {
  const match = /^TK-(\d{1,6})-([A-Z2-9]{8})$/.exec(normalizeCode(code));
  if (!match) return null;
  const member = Number.parseInt(match[1], 10);
  return member > 0 && member <= MAX_MEMBERS_LIMIT ? member : null;
}

/**
 * Forgiving about how people type codes on phones: any case, and spaces, underscores or
 * autocorrected dashes (en/em dash, minus sign) between the parts, e.g. "tk 007 abcd2345".
 */
export function normalizeCode(code: string): string {
  return code
    .trim()
    .toUpperCase()
    .replace(/[\s_\u2010-\u2015\u2212-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The member number if the code is genuine, is within the current cap and is not revoked. */
export async function redeemInviteCode(config: AccessConfig, code: string): Promise<number | null> {
  if (normalizeCode(code).startsWith(SHARED_PREFIX)) {
    if (!config.shared.enabled) return null;
    const expected = await makeSharedCode(config.secret, config.shared.version);
    return safeEqual(expected, normalizeCode(code)) ? SHARED_BASE + config.shared.version : null;
  }
  const member = memberFromCode(code);
  if (member === null || member > config.maxMembers || config.revoked.has(member)) return null;
  const expected = await makeInviteCode(config.secret, member);
  return safeEqual(expected, normalizeCode(code)) ? member : null;
}

// ── Session cookie ──────────────────────────────────────────────────────────

export async function signSession(secret: string, member: number, nowMs = Date.now()): Promise<string> {
  const expires = Math.floor(nowMs / 1000) + SESSION_DAYS * 86400;
  const body = `${member}.${expires}`;
  const signature = toHex(await hmac(secret, `session:${body}`)).slice(0, 32);
  return `${body}.${signature}`;
}

/** The member number if the cookie is genuine, unexpired, within the cap and not revoked. */
export async function verifySession(
  config: AccessConfig,
  cookie: string | undefined | null,
  nowMs = Date.now(),
): Promise<number | null> {
  if (!cookie) return null;
  const parts = cookie.split(".");
  if (parts.length !== 3) return null;
  const member = Number.parseInt(parts[0], 10);
  const expires = Number.parseInt(parts[1], 10);
  if (!Number.isInteger(member) || member <= 0 || !Number.isInteger(expires)) return null;
  if (expires * 1000 < nowMs) return null;
  // Shared-code sessions are good while that code is on and current; the member cap and
  // withdrawn list are about individual invites and do not apply.
  const shared = member > SHARED_BASE;
  if (shared ? !config.shared.enabled || member - SHARED_BASE !== config.shared.version
             : member > config.maxMembers || config.revoked.has(member)) return null;
  const expected = toHex(await hmac(config.secret, `session:${member}.${expires}`)).slice(0, 32);
  return safeEqual(expected, parts[2]) ? member : null;
}

export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return undefined;
}

export function sessionCookieHeader(value: string, secure: boolean): string {
  return [
    `${ACCESS_COOKIE}=${value}`,
    "Path=/",
    `Max-Age=${SESSION_DAYS * 86400}`,
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : "",
  ].filter(Boolean).join("; ");
}
