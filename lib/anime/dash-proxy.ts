import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

interface DashProxySession {
  manifestUrl: string;
  authorization: string;
  referer: string;
  expiresAt: number;
}

function encryptionKey(): Buffer {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required for DASH playback");
  return createHash("sha256").update("tatakai:dash-proxy:v1:").update(secret).digest();
}

export function createDashProxyToken(manifestUrl: string, authorization: string, referer: string): string {
  const session: DashProxySession = {
    manifestUrl,
    authorization,
    referer,
    expiresAt: Date.now() + 4 * 60 * 60 * 1000,
  };
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(session)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function readDashProxyToken(token: string): DashProxySession | null {
  try {
    const data = Buffer.from(token, "base64url");
    if (data.length < 29) return null;
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), data.subarray(0, 12));
    decipher.setAuthTag(data.subarray(12, 28));
    const decoded = Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
    const session = JSON.parse(decoded) as DashProxySession;
    if (typeof session.manifestUrl !== "string" ||
        typeof session.authorization !== "string" ||
        typeof session.referer !== "string" ||
        !Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now()) return null;
    if (new URL(session.manifestUrl).protocol !== "https:") return null;
    return session;
  } catch {
    return null;
  }
}

export function isAllowedDashAsset(assetUrl: URL, manifestUrl: string): boolean {
  const manifest = new URL(manifestUrl);
  if (assetUrl.protocol !== "https:" || assetUrl.username || assetUrl.password) return false;
  const animeOnsenHost = (host: string) => host === "animeonsen.xyz" || host.endsWith(".animeonsen.xyz");
  return assetUrl.origin === manifest.origin ||
    (animeOnsenHost(manifest.hostname) && animeOnsenHost(assetUrl.hostname));
}

export function buildDashProxyUrl(url: string, token: string): string {
  const params = new URLSearchParams({ url, token });
  return `/api/proxy/dash?${params}`;
}
