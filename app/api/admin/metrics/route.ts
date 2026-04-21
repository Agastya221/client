import { NextResponse } from "next/server";
import { cacheStats } from "@/lib/cache";
import { getObservabilitySnapshot } from "@/lib/observability";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const providedKey = searchParams.get("key") || "";
  const expectedKey = process.env.CRON_SECRET || process.env.AUTH_SECRET || "";

  if (expectedKey && providedKey !== expectedKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    status: "ok",
    generatedAt: new Date().toISOString(),
    process: {
      pid: process.pid,
      uptimeSeconds: Math.round(process.uptime()),
      nodeEnv: process.env.NODE_ENV || "development",
    },
    cache: cacheStats(),
    observability: getObservabilitySnapshot(),
  });
}
