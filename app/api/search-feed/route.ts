import { getSearchPageModel } from "@/lib/anime/api";
import { normalizeProviderParam } from "@/lib/anime/fallback";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function parsePositiveInt(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseDubbed(value: string | null): boolean {
  return value === "1" || value === "true";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  try {
    const model = await getSearchPageModel({
      query: searchParams.get("q") || "",
      genre: searchParams.get("genre") || "",
      page: parsePositiveInt(searchParams.get("page")),
      dubbed: parseDubbed(searchParams.get("dub")),
      provider: normalizeProviderParam(searchParams.get("provider")),
    });

    return NextResponse.json(model, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Unable to load search results",
      },
      { status: 500 },
    );
  }
}
