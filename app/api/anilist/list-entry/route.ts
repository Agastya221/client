import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { cacheFetch } from "@/lib/cache";
import { getAnilistListEntry } from "@/lib/anilist/user";
import { fromAnilistListStatus } from "@/lib/anilist/list-status";
import {
  ANILIST_LIST_ENTRY_CACHE_TTL_SECONDS,
  anilistListEntryCacheKey,
  type CachedAnilistListEntryEnvelope,
} from "@/lib/anilist/list-entry-cache";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ entry: null }, { status: 401 });
  }

  const mediaId = Number(new URL(request.url).searchParams.get("mediaId"));
  if (!Number.isInteger(mediaId) || mediaId <= 0) {
    return NextResponse.json({ error: "Invalid mediaId" }, { status: 400 });
  }

  const account = await prisma.account.findFirst({
    where: {
      userId: session.user.id,
      provider: "anilist",
    },
    select: {
      access_token: true,
      providerAccountId: true,
    },
  });

  if (!account?.access_token || !account.providerAccountId) {
    return NextResponse.json({ entry: null }, { status: 401 });
  }

  try {
    const cacheKey = anilistListEntryCacheKey(account.providerAccountId, mediaId);
    const cacheMs = ANILIST_LIST_ENTRY_CACHE_TTL_SECONDS * 1000;
    const payload = await cacheFetch<CachedAnilistListEntryEnvelope>(
      cacheKey,
      async () => {
        const entry = await getAnilistListEntry(account.access_token!, mediaId);
        return {
          entry: entry
            ? {
                id: entry.id,
                status: fromAnilistListStatus(entry.status),
                progress: Math.max(0, Number(entry.progress || 0)),
                score: entry.score ?? null,
              }
            : null,
        };
      },
      {
        freshMs: cacheMs,
        staleMs: cacheMs,
        expireMs: cacheMs,
      },
    );

    return NextResponse.json(
      payload,
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (error) {
    console.error("[anilist-list-entry] Error:", error);
    return NextResponse.json({ error: "Unable to read AniList status" }, { status: 502 });
  }
}
