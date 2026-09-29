import { NextResponse } from "next/server";
import { discoverAnivexaProviderServerOptions } from "@/lib/anime/api";
import { normalizeProviderParam } from "@/lib/anime/fallback";
import { ANIVEXA_STREAM_PROVIDERS, type AnivexaWorkerProvider } from "@/lib/anime/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const anilistId = Number(params.get("anilistId"));
  const episodeNumber = Number(params.get("episodeNumber"));
  const workerProvider = params.get("workerProvider") as AnivexaWorkerProvider;
  const uiProvider = normalizeProviderParam(params.get("uiProvider") || "") || "animekai";
  if (
    !Number.isInteger(anilistId) || anilistId <= 0 ||
    !Number.isInteger(episodeNumber) || episodeNumber <= 0 ||
    !ANIVEXA_STREAM_PROVIDERS.includes(workerProvider)
  ) {
    return NextResponse.json({ error: "Invalid server discovery request" }, { status: 400 });
  }

  try {
    const serverOptions = await discoverAnivexaProviderServerOptions({
      anilistId,
      episodeNumber,
      dubbed: params.get("dub") === "1",
      uiProvider,
      workerProvider,
    });
    return NextResponse.json({ serverOptions }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ serverOptions: [] }, { status: 502 });
  }
}
