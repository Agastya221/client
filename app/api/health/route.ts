import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const backendUrl = process.env.ANIME_API_BASE_URL || "http://localhost:5000";
  let backendStatus = "unknown";

  try {
    const res = await fetch(`${backendUrl}/api/cache/stats`, {
      signal: AbortSignal.timeout(3000),
    });
    backendStatus = res.ok ? "ok" : `error (${res.status})`;
  } catch {
    backendStatus = "unreachable";
  }

  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "0.1.0",
    backend: backendStatus,
    uptime: process.uptime(),
  });
}
