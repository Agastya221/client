/**
 * Login for the admin panel. One password (SITE_ADMIN_PASSWORD) trades for a signed, HttpOnly
 * cookie that lasts 12 hours. With no password configured the panel is switched off entirely.
 * The cookie is tied to the password, so changing the password signs every admin out.
 */
import { hmacKey, readCookie } from "./invite";

export const ADMIN_COOKIE = "tk_admin";
const ADMIN_HOURS = 12;
const encoder = new TextEncoder();

type Env = Record<string, unknown>;

async function sign(secret: string, message: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(message)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}

function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function password(env: Env): string {
  return typeof env.SITE_ADMIN_PASSWORD === "string" ? env.SITE_ADMIN_PASSWORD : "";
}

export function adminConfigured(env: Env): boolean {
  return password(env).length >= 8;
}

export async function passwordMatches(env: Env, attempt: string, secret: string): Promise<boolean> {
  if (!adminConfigured(env)) return false;
  // Compare HMACs of both so the comparison time does not depend on how much of the password matched.
  return same(await sign(secret, `pw:${attempt}`), await sign(secret, `pw:${password(env)}`));
}

async function cookieSignature(env: Env, secret: string, expires: number): Promise<string> {
  // The password's own HMAC goes into the message, never the password itself.
  return sign(secret, `admin:${expires}:${await sign(secret, `pw:${password(env)}`)}`);
}

export async function makeAdminCookie(env: Env, secret: string, nowMs = Date.now()): Promise<string> {
  const expires = Math.floor(nowMs / 1000) + ADMIN_HOURS * 3600;
  return `${expires}.${await cookieSignature(env, secret, expires)}`;
}

export async function isAdmin(env: Env, request: Request, secret: string, nowMs = Date.now()): Promise<boolean> {
  if (!adminConfigured(env)) return false;
  const value = readCookie(request.headers.get("cookie"), ADMIN_COOKIE);
  if (!value) return false;
  const [expires, signature] = value.split(".");
  const at = Number.parseInt(expires ?? "", 10);
  if (!Number.isInteger(at) || at * 1000 < nowMs || !signature) return false;
  return same(await cookieSignature(env, secret, at), signature);
}

export function adminCookieHeader(value: string, secure: boolean, clear = false): string {
  return [
    `${ADMIN_COOKIE}=${clear ? "" : value}`,
    "Path=/",
    `Max-Age=${clear ? 0 : ADMIN_HOURS * 3600}`,
    "HttpOnly",
    "SameSite=Strict",
    secure ? "Secure" : "",
  ].filter(Boolean).join("; ");
}
