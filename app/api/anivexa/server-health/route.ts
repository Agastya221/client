import { NextResponse } from "next/server";
import { checkAnivexaServerHealth } from "@/lib/anime/api";
import { normalizeProviderParam } from "@/lib/anime/fallback";
import { ANIVEXA_STREAM_PROVIDERS, type AnivexaWorkerProvider } from "@/lib/anime/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const anilistId = Number(params.get("anilistId"));
  const episodeNumber = Number(params.get("episodeNumber"));
  const serverId = params.get("server") || "";
  const dubbed = params.get("dub") === "1";
  const match = serverId.match(/^anivexa2-([a-z0-9]+)-(hls|mp4|dash|embed)-(?:s\d+-)?(soft|hard|unknown|dub)$/);
  const workerProvider = match?.[1] as AnivexaWorkerProvider;
  if (!Number.isInteger(anilistId) || anilistId <= 0 ||
      !Number.isInteger(episodeNumber) || episodeNumber <= 0 ||
      !match || !ANIVEXA_STREAM_PROVIDERS.includes(workerProvider) ||
      dubbed !== (match[3] === "dub")) {
    return NextResponse.json({ error: "Invalid server health request" }, { status: 400 });
  }

  try {
    const health = await checkAnivexaServerHealth({
      anilistId,
      episodeNumber,
      dubbed,
      uiProvider: normalizeProviderParam(params.get("uiProvider") || "") || "animekai",
      workerProvider,
      serverId,
    });
    return NextResponse.json(health, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "unverified", reason: "Check unavailable", checkedAt: Date.now() }, {
      headers: { "Cache-Control": "no-store" },
    });
  }
}
