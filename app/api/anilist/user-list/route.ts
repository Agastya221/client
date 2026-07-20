import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    let userId = searchParams.get("userId");

    if (!userId) {
      const session = await auth();
      userId = session?.user?.id || null;
    }

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized / Missing User ID" }, { status: 401 });
    }

    const query = `
      query ($userId: Int) {
        MediaListCollection(userId: $userId, type: ANIME) {
          lists {
            name
            status
            entries {
              id
              mediaId
              status
              progress
              score
              updatedAt
              media {
                id
                title {
                  userPreferred
                  english
                  romaji
                }
                coverImage {
                  extraLarge
                  large
                }
                bannerImage
                format
                episodes
                status
                genres
                seasonYear
                averageScore
              }
            }
          }
        }
      }
    `;

    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { userId: Number(userId) } }),
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: "Failed to fetch AniList collection", details: errText }, { status: res.status });
    }

    const data = await res.json();
    const lists = data?.data?.MediaListCollection?.lists || [];

    const entries: Array<{
      animeId: string;
      rawId: number;
      title: string;
      poster: string | null;
      banner: string | null;
      href: string;
      status: string;
      progress: number;
      episodes: number | null;
      score: number;
      format: string | null;
      genres: string[];
      updatedAt: number;
    }> = [];

    for (const list of lists) {
      for (const item of list.entries || []) {
        const m = item.media;
        if (!m) continue;

        let statusKey = "PLAN_TO_WATCH";
        switch (item.status) {
          case "CURRENT":
          case "REPEATING":
            statusKey = "WATCHING";
            break;
          case "COMPLETED":
            statusKey = "COMPLETED";
            break;
          case "PLANNING":
            statusKey = "PLAN_TO_WATCH";
            break;
          case "PAUSED":
            statusKey = "ON_HOLD";
            break;
          case "DROPPED":
            statusKey = "DROPPED";
            break;
        }

        const title = m.title?.userPreferred || m.title?.english || m.title?.romaji || "Unknown Anime";
        entries.push({
          animeId: `anilist~${m.id}`,
          rawId: m.id,
          title,
          poster: m.coverImage?.extraLarge || m.coverImage?.large || null,
          banner: m.bannerImage || null,
          href: `/anime/anilist~${m.id}`,
          status: statusKey,
          progress: item.progress || 0,
          episodes: m.episodes || null,
          score: item.score || 0,
          format: m.format || null,
          genres: m.genres || [],
          updatedAt: item.updatedAt ? item.updatedAt * 1000 : Date.now(),
        });
      }
    }

    return NextResponse.json({ entries, total: entries.length });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Internal Server Error" }, { status: 500 });
  }
}
