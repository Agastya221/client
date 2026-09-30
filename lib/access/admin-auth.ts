/**
 * Login for the admin panel. One password (SITE_ADMIN_PASSWORD) trades for a signed, HttpOnly
 * cookie that lasts 12 hours. With no password configured the panel is switched off entirely.
 */
import { readCookie } from "./invite";

export const ADMIN_COOKIE = "tk_admin";
const ADMIN_HOURS = 12;
const encoder = new TextEncoder();

async function sign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}

function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function adminConfigured(env: Record<string, unknown>): boolean {
  return typeof env.SITE_ADMIN_PASSWORD === "string" && env.SITE_ADMIN_PASSWORD.length >= 8;
}

export async function passwordMatches(env: Record<string, unknown>, attempt: string, secret: string): Promise<boolean> {
  if (!adminConfigured(env)) return false;
  // Compare HMACs of both so the comparison time does not depend on how much of the password matched.
  return same(await sign(secret, `pw:${attempt}`), await sign(secret, `pw:${env.SITE_ADMIN_PASSWORD}`));
}

export async function makeAdminCookie(secret: string, nowMs = Date.now()): Promise<string> {
  const expires = Math.floor(nowMs / 1000) + ADMIN_HOURS * 3600;
  return `${expires}.${await sign(secret, `admin:${expires}`)}`;
}

export async function isAdmin(request: Request, secret: string, nowMs = Date.now()): Promise<boolean> {
  const value = readCookie(request.headers.get("cookie"), ADMIN_COOKIE);
  if (!value) return false;
  const [expires, signature] = value.split(".");
  const at = Number.parseInt(expires ?? "", 10);
  if (!Number.isInteger(at) || at * 1000 < nowMs || !signature) return false;
  return same(await sign(secret, `admin:${at}`), signature);
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
