import { NextResponse } from "next/server";
import {
  adminConfigured, adminCookieHeader, isAdmin, makeAdminCookie, passwordMatches,
} from "@/lib/access/admin-auth";
import { getAccessConfig, makeInviteCode } from "@/lib/access/invite";
import { routeEnv } from "@/lib/access/route-env";
import {
  readSiteSettings, resolveAccessConfig, resolveWatching, sanitizeSettings, settingsBackend, writeSiteSettings,
} from "@/lib/access/settings";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const MAX_CODES_SHOWN = 500;
const clientIp = (request: Request) =>
  request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
const isSecure = (request: Request) =>
  new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

const OFF = "Admin panel is off. Set SITE_ADMIN_PASSWORD (8+ characters).";
const NO_SECRET = "Set SITE_ACCESS_SECRET (or AUTH_SECRET) first.";

/** The panel's current state: settings, codes and where they are stored. */
export async function GET(request: Request) {
  const env = routeEnv();
  if (!adminConfigured(env)) return json({ error: OFF }, 503);
  const base = getAccessConfig({ ...env, SITE_ACCESS: "on" });
  if (!base.secret) return json({ error: NO_SECRET }, 503);
  if (!(await isAdmin(request, base.secret))) return json({ error: "Sign in." }, 401);

  const stored = await readSiteSettings(env, { fresh: true });
  const config = await resolveAccessConfig(env);
  const shown = Math.min(Math.max(config.maxMembers, 50), MAX_CODES_SHOWN);
  const codes = await Promise.all(
    Array.from({ length: shown }, async (_, i) => ({ member: i + 1, code: await makeInviteCode(base.secret, i + 1) })),
  );
  return json({
    gateOn: getAccessConfig(env).enabled,
    storage: settingsBackend(env),
    maxMembers: config.maxMembers,
    revoked: [...config.revoked].sort((a, b) => a - b),
    watching: resolveWatching(stored),
    codes,
  });
}

export async function POST(request: Request) {
  const env = routeEnv();
  if (!adminConfigured(env)) return json({ error: OFF }, 503);
  const secret = getAccessConfig({ ...env, SITE_ACCESS: "on" }).secret;
  if (!secret) return json({ error: NO_SECRET }, 503);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Bad request." }, 400);
  }

  if (body.action === "login") {
    if (!rateLimit(`admin:${clientIp(request)}`, 8).allowed) return json({ error: "Too many attempts. Wait a minute." }, 429);
    if (!(await passwordMatches(env, String(body.password ?? ""), secret))) return json({ error: "Wrong password." }, 401);
    const response = json({ ok: true });
    response.headers.append("Set-Cookie", adminCookieHeader(await makeAdminCookie(secret), isSecure(request)));
    return response;
  }

  if (body.action === "logout") {
    const response = json({ ok: true });
    response.headers.append("Set-Cookie", adminCookieHeader("", isSecure(request), true));
    return response;
  }

  if (!(await isAdmin(request, secret))) return json({ error: "Sign in." }, 401);

  if (body.action === "save") {
    const next = sanitizeSettings(body.settings);
    // The counter's peak stays well under the member limit, whatever is typed in.
    const cap = next.maxMembers ?? (await resolveAccessConfig(env)).maxMembers;
    const ceiling = Math.max(1, Math.floor(cap * 0.8));
    if (next.watching) {
      if (next.watching.max !== undefined) next.watching.max = Math.min(next.watching.max, ceiling);
      if (next.watching.min !== undefined) next.watching.min = Math.min(next.watching.min, next.watching.max ?? ceiling);
    }
    try {
      const stored = await readSiteSettings(env, { fresh: true });
      await writeSiteSettings(env, { ...stored, ...next, watching: { ...stored.watching, ...next.watching } });
    } catch (error) {
      return json({ error: String(error instanceof Error ? error.message : error) }, 500);
    }
    return json({ ok: true });
  }

  return json({ error: "Unknown action." }, 400);
}
