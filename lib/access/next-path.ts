/**
 * Where to send someone after the invite page: the `next` path if it stays on this site,
 * else the home page. "/\evil.com" and "//evil.com" both mean another site to a browser,
 * so a plain startsWith("/") check is not enough. Shared by the worker gate and the page.
 */
export function safeNextPath(next: string | null | undefined, origin = "https://site.invalid"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";
  try {
    const url = new URL(next, origin);
    return url.origin === origin ? `${url.pathname}${url.search}${url.hash}` : "/";
  } catch {
    return "/";
  }
}
