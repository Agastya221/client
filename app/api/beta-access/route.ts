import { NextResponse } from "next/server";
import { getAccessConfig, redeemInviteCode, sessionCookieHeader, signSession } from "@/lib/access/invite";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Trades a valid invite code for the access cookie. */
export async function POST(request: Request) {
  const config = getAccessConfig(process.env);
  if (!config.enabled) return NextResponse.json({ ok: true, open: true });

  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`invite:${ip}`, 10).allowed) {
    return NextResponse.json({ error: "Too many attempts. Wait a minute and try again." }, { status: 429 });
  }

  let code = "";
  try {
    const body = (await request.json()) as { code?: unknown };
    code = typeof body.code === "string" ? body.code : "";
  } catch {
    return NextResponse.json({ error: "Enter your invite code." }, { status: 400 });
  }

  const member = await redeemInviteCode(config, code);
  if (member === null) {
    return NextResponse.json({ error: "That invite code isn't valid." }, { status: 401 });
  }

  const secure = new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
  const response = NextResponse.json({ ok: true });
  response.headers.append("Set-Cookie", sessionCookieHeader(await signSession(config.secret, member), secure));
  return response;
}
