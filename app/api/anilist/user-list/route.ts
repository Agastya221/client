import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    let userIdParam = searchParams.get("userId") || searchParams.get("id");
    let userNameParam = searchParams.get("userName") || searchParams.get("username") || searchParams.get("name");

    const session = await auth();

    // If no params, use NextAuth session
    if (!userIdParam && !userNameParam) {
      if (session?.user) {
        userNameParam = session.user.name || null;
        userIdParam = session.user.id || null;
      }
    }

    // Determine query variables
    let queryVariables: Record<string, any> | null = null;
    let query = `
      query ($userId: Int, $userName: String) {
        MediaListCollection(userId: $userId, userName: $userName, type: ANIME) {
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

    // Try userName first if available (e.g., "agastya221")
    if (userNameParam && typeof userNameParam === "string" && userNameParam.trim().length > 0) {
      queryVariables = { userName: userNameParam.trim() };
    } else if (userIdParam) {
      const cleanId = String(userIdParam).trim();
      if (/^\d+$/.test(cleanId)) {
        queryVariables = { userId: Number(cleanId) };
      } else {
        // If userId is non-numeric string (e.g. username passed as ID), treatment as userName
        queryVariables = { userName: cleanId };
      }
    }

    if (!queryVariables && session?.user?.name) {
      queryVariables = { userName: session.user.name };
    }

    if (!queryVariables) {
      return NextResponse.json({ error: "Unauthorized / Missing User Identifier" }, { status: 401 });
    }

    let res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: queryVariables }),
      next: { revalidate: 30 },
    });

    let data = await res.json();

    // Fallback: If query by userId failed, try session.user.name
    if ((!res.ok || data.errors || !data?.data?.MediaListCollection) && session?.user?.name && queryVariables.userName !== session.user.name) {
      res = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables: { userName: session.user.name } }),
        next: { revalidate: 30 },
      });
      data = await res.json();
    }

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
        const targetEp = item.progress && item.progress > 0 ? item.progress : 1;
        entries.push({
          animeId: `anilist~${m.id}`,
          rawId: m.id,
          title,
          poster: m.coverImage?.extraLarge || m.coverImage?.large || null,
          banner: m.bannerImage || null,
          href: `/anime/anilist~${m.id}/watch?ep=${targetEp}`,
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

    return NextResponse.json({ entries, total: entries.length, queriedWith: queryVariables });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Internal Server Error" }, { status: 500 });
  }
}
