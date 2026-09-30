/**
 * The closed-community gate. worker.ts calls this before handing a request to Next.js.
 *
 * It sits in the worker rather than in Next.js because most pages are answered straight from
 * the ISR cache without Next.js running at all, so nothing inside Next could see them.
 *
 * Returns null to let the request through, or a Response that ends it: a redirect to the invite
 * page for someone opening a page, a 401 for everything else. With SITE_ACCESS unset it always
 * returns null, so the site behaves exactly as it did before this existed.
 */
import { ACCESS_COOKIE, getAccessConfig, readCookie, signedSessionMember, verifySession } from "./invite";
import { safeNextPath } from "./next-path";
import { resolveAccessConfig } from "./settings";

export const INVITE_PAGE = "/beta-access";

/** Reachable without an invite: the invite page itself and what it needs to work. */
const OPEN_PREFIXES = [
  INVITE_PAGE,
  "/api/beta-access",
  // The owner must get in even if locked out: these have their own admin password.
  "/admin/access",
  "/api/admin/access",
  "/_next/",
  // Already protected by their own signed links, and used by players that send no cookie.
  "/api/proxy/",
  "/api/health",
  "/api/cron/",
];

const OPEN_EXACT = new Set(["/favicon.ico", "/robots.txt", "/manifest.webmanifest", "/apple-touch-icon.png"]);

const STATIC_FILE = /\.(?:js|css|map|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf)$/i;

export function isOpenPath(pathname: string): boolean {
  if (OPEN_EXACT.has(pathname) || STATIC_FILE.test(pathname)) return true;
  return OPEN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`));
}

function wantsPage(request: Request): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  const pathname = new URL(request.url).pathname;
  return !pathname.startsWith("/api/");
}

export async function applyAccessGate(request: Request, env?: Record<string, unknown>): Promise<Response | null> {
  // Cheap checks first: with the gate off, or for static files, nothing else (not even a
  // settings read) happens.
  if (!getAccessConfig(env).enabled) return null;
  const url = new URL(request.url);
  const onInvitePage = url.pathname === INVITE_PAGE && wantsPage(request);
  if (request.method === "OPTIONS" || (isOpenPath(url.pathname) && !onInvitePage)) return null;

  const cookie = readCookie(request.headers.get("cookie"), ACCESS_COOKIE);
  let config = await resolveAccessConfig(env);
  let member = await verifySession(config, cookie);
  // Settings are cached for up to a minute. If a genuinely signed pass is refused, the admin may
  // have just changed something (turned the friends code back on, raised the cap), so check the
  // latest once. Junk or forged cookies never get here, so this cannot be used to spend KV reads.
  if (member === null && (await signedSessionMember(config.secret, cookie)) !== null) {
    config = await resolveAccessConfig(env, { fresh: true });
    member = await verifySession(config, cookie);
  }

  // Members who open the invite page again go straight on into the site.
  if (onInvitePage) {
    if (member === null) return null;
    return new Response(null, {
      status: 302,
      headers: { Location: safeNextPath(url.searchParams.get("next")), "Cache-Control": "no-store" },
    });
  }
  if (member !== null) return null;

  if (wantsPage(request)) {
    const next = url.pathname + url.search;
    const target = next === "/" ? INVITE_PAGE : `${INVITE_PAGE}?next=${encodeURIComponent(next)}`;
    return new Response(null, {
      status: 302,
      headers: { Location: target, "Cache-Control": "no-store" },
    });
  }

  return new Response(JSON.stringify({ error: "This site is invite-only.", code: "invite_required" }), {
    status: 401,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
