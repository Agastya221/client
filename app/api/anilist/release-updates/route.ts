import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { cacheFetch } from "@/lib/cache";
import { getAnilistFollowedReleaseEntries } from "@/lib/anilist/user";
import {
  buildFollowedReleaseUpdates,
  type FollowedReleaseListEntry,
  type FollowedReleaseMedia,
} from "@/lib/anilist/release-updates";
import { anilistFetch } from "@/lib/anilist/endpoint";


const MEDIA_BATCH_QUERY = `
  query MediaBatch($ids: [Int]) {
    Page(page: 1, perPage: 50) {
      media(id_in: $ids, type: ANIME) {
        id
        title { userPreferred english romaji }
        coverImage { extraLarge large medium color }
        bannerImage
        format
        episodes
        status
        seasonYear
        startDate { year month day }
        nextAiringEpisode { episode airingAt }
        relations {
          edges {
            relationType
            node {
              id
              title { userPreferred english romaji }
              coverImage { extraLarge large medium color }
              bannerImage
              format
              episodes
              status
              seasonYear
              startDate { year month day }
              nextAiringEpisode { episode airingAt }
            }
          }
        }
      }
    }
  }
`;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ updates: [] });
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

  const userId = Number(account?.providerAccountId);
  if (!account?.access_token || !Number.isInteger(userId) || userId <= 0) {
    return NextResponse.json({ updates: [] });
  }

  try {
    const updates = await cacheFetch(
      `anilist:release-updates:user:${userId}`,
      async () => {
        const entries = await getAnilistFollowedReleaseEntries(account.access_token!, userId);
        return buildFollowedReleaseUpdates(entries);
      },
      {
        freshMs: 5 * 60 * 1000,
        staleMs: 5 * 60 * 1000,
        expireMs: 5 * 60 * 1000,
        persistent: false,
        shouldCache: (value) => Array.isArray(value),
      },
    );

    return NextResponse.json(
      { updates },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (error) {
    console.error("[anilist-release-updates] Error:", error);
    return NextResponse.json({ updates: [] });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawItems: Array<{ id: number | string; progress?: number; status?: string }> = Array.isArray(body?.items) ? body.items : [];

    if (rawItems.length === 0) {
      return NextResponse.json({ updates: [] });
    }

    const itemsMap = new Map<number, { progress: number; status: string }>();
    const ids: number[] = [];

    for (const item of rawItems) {
      let id = 0;
      if (typeof item.id === "number") {
        id = item.id;
      } else if (typeof item.id === "string") {
        const str = item.id.replace("anilist~", "").trim();
        id = Number(str);
      }

      if (Number.isInteger(id) && id > 0) {
        ids.push(id);
        itemsMap.set(id, {
          progress: Math.max(0, Number(item.progress) || 0),
          status: String(item.status || "CURRENT").toUpperCase(),
        });
      }
    }

    if (ids.length === 0) {
      return NextResponse.json({ updates: [] });
    }

    const uniqueIds = Array.from(new Set(ids)).slice(0, 50);

    const res = await anilistFetch({
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        query: MEDIA_BATCH_QUERY,
        variables: { ids: uniqueIds },
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json({ updates: [] });
    }

    const json = await res.json() as {
      data?: {
        Page?: {
          media?: FollowedReleaseMedia[];
        };
      };
    };
    const mediaList = json.data?.Page?.media || [];

    const entries: FollowedReleaseListEntry[] = mediaList.map((media) => {
      const userItem = itemsMap.get(media.id);
      return {
        status: userItem?.status || "CURRENT",
        progress: userItem?.progress || 0,
        updatedAt: Math.floor(Date.now() / 1000),
        media,
      };
    });

    const updates = buildFollowedReleaseUpdates(entries);

    return NextResponse.json({ updates });
  } catch (error) {
    console.error("[anilist-release-updates-post] Error:", error);
    return NextResponse.json({ updates: [] });
  }
}
