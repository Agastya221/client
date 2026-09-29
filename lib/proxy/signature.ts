import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed links for the media proxy (/api/proxy/m3u8-streaming-proxy).
 *
 * The proxy fetches whatever `url` it is given, so without this anyone could use it to
 * relay arbitrary content and burn the Worker's 100,000 requests a day. Every proxy link
 * the server hands out is signed over its target `url` and `referer`, and the proxy
 * refuses links without a valid signature. A signature is tied to that exact target, so
 * a leaked link cannot be pointed anywhere else. No host allowlist is needed, so CDN
 * hostname changes do not break playback.
 *
 * The key is derived from AUTH_SECRET (already set wherever the site runs). With no
 * secret, links are unsigned and verification fails closed.
 *
 * Secrets are read at call time: on Workers, process.env is populated per request, and
 * worker.ts passes its env binding explicitly.
 */
export const PROXY_SIGNATURE_PARAM = "sig";

type SecretSource = Record<string, unknown> | undefined;

function proxyKey(env?: SecretSource): Buffer | null {
  const fromEnv = (name: string) => {
    const value = env?.[name];
    return typeof value === "string" && value ? value : undefined;
  };
  const secret = fromEnv("AUTH_SECRET") || fromEnv("NEXTAUTH_SECRET")
    || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) return null;
  // Domain-separated so this key is never interchangeable with Auth.js's own use.
  return createHmac("sha256", secret).update("tatakai-media-proxy-v1").digest();
}

function signatureFor(key: Buffer, targetUrl: string, referer: string | null): string {
  return createHmac("sha256", key)
    .update(`${targetUrl}\n${referer ?? ""}`)
    .digest("base64url");
}

/** Adds a signature to proxy query params that already hold `url` (and maybe `referer`). */
export function signProxyParams(params: URLSearchParams, env?: SecretSource): void {
  const targetUrl = params.get("url");
  const key = proxyKey(env);
  if (!targetUrl || !key) return;
  params.set(PROXY_SIGNATURE_PARAM, signatureFor(key, targetUrl, params.get("referer")));
}

/** True when the params carry a valid signature for their `url` and `referer`. */
export function verifyProxyParams(params: URLSearchParams, env?: SecretSource): boolean {
  const targetUrl = params.get("url");
  const provided = params.get(PROXY_SIGNATURE_PARAM);
  const key = proxyKey(env);
  if (!targetUrl || !provided || !key) return false;
  const expected = Buffer.from(signatureFor(key, targetUrl, params.get("referer")));
  const actual = Buffer.from(provided);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function unsignedProxyResponse(): Response {
  return new Response("Invalid or missing proxy signature", {
    status: 403,
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" },
  });
}
