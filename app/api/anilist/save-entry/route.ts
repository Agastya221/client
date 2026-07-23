import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { kvDelete } from "@/lib/cache/kv";

type AniListSession = {
  accessToken?: string;
  anilistId?: string;
  user?: {
    id?: string | null;
    name?: string | null;
  };
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Internal Server Error";
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized: Please sign in with AniList" }, { status: 401 });
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
    const accessToken =
      (session as AniListSession).accessToken || account?.access_token || undefined;
    const anilistUserId =
      account?.providerAccountId || (session as AniListSession).anilistId || null;

    if (!accessToken) {
      return NextResponse.json({
        error: "AniList access token missing. Please sign out and sign in with AniList again.",
      }, { status: 401 });
    }

    const body = await request.json();
    const { animeId, rawMediaId, title, status, progress, score, monotonicProgress } = body;

    let mediaId = rawMediaId ? Number(rawMediaId) : null;
    if (!mediaId || isNaN(mediaId)) {
      if (animeId) {
        const str = String(animeId);
        const matchPrefix = str.match(/^(?:anilist|animekai|hianime|desidub|reanime|allmanga|anikoto|animegg|anineko)~(.+)$/);
        const cleaned = matchPrefix ? matchPrefix[1] : str;

        if (/^\d+$/.test(cleaned)) {
          mediaId = Number(cleaned);
        } else {
          const matchSuffix = cleaned.match(/-(\d+)$/);
          if (matchSuffix) mediaId = Number(matchSuffix[1]);
        }
      }
    }

    // Fallback: Search AniList GraphQL by title or slug if mediaId is still missing/NaN
    if (!mediaId || isNaN(mediaId)) {
      const searchTerm = (title || String(animeId || ""))
        .replace(/^(anilist|animekai|hianime|desidub|reanime|allmanga|anikoto|animegg|anineko)~/, "")
        .replace(/-/g, " ")
        .trim();
      if (searchTerm) {
        try {
          const searchRes = await fetch("https://graphql.anilist.co", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              query: `query ($search: String) { Media (search: $search, type: ANIME) { id } }`,
              variables: { search: searchTerm },
            }),
          });
          if (searchRes.ok) {
            const searchData = await searchRes.json();
            const foundId = searchData?.data?.Media?.id;
            if (foundId && typeof foundId === "number") {
              mediaId = foundId;
            }
          }
        } catch {
          // best effort
        }
      }
    }

    if (!mediaId || isNaN(mediaId)) {
      return NextResponse.json({ error: "Invalid or missing mediaId" }, { status: 400 });
    }

    // Map status string to AniList MediaListStatus enum
    let anilistStatus: string | null = null;
    if (status) {
      switch (String(status).toUpperCase()) {
        case "WATCHING":
        case "CURRENT":
          anilistStatus = "CURRENT";
          break;
        case "COMPLETED":
          anilistStatus = "COMPLETED";
          break;
        case "PLAN_TO_WATCH":
        case "PLANNING":
          anilistStatus = "PLANNING";
          break;
        case "ON_HOLD":
        case "PAUSED":
          anilistStatus = "PAUSED";
          break;
        case "DROPPED":
          anilistStatus = "DROPPED";
          break;
        case "REPEATING":
          anilistStatus = "REPEATING";
          break;
        default:
          anilistStatus = "CURRENT";
      }
    }

    const mutation = `
      mutation ($mediaId: Int, $status: MediaListStatus, $progress: Int, $score: Float) {
        SaveMediaListEntry (mediaId: $mediaId, status: $status, progress: $progress, score: $score) {
          id
          mediaId
          status
          progress
          score
          media {
            id
            title {
              userPreferred
            }
          }
        }
      }
    `;

    let resolvedProgress =
      progress !== undefined && progress !== null
        ? Math.max(0, Math.trunc(Number(progress)))
        : undefined;

    if (monotonicProgress === true && resolvedProgress !== undefined) {
      const currentEntryQuery = `
        query CurrentProgress($mediaId: Int) {
          Media(id: $mediaId, type: ANIME) {
            episodes
            status
            mediaListEntry {
              progress
              status
            }
          }
        }
      `;
      const currentEntryResponse = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          query: currentEntryQuery,
          variables: { mediaId },
        }),
        cache: "no-store",
      });
      const currentEntryData = await currentEntryResponse.json().catch(() => null);
      if (!currentEntryResponse.ok || currentEntryData?.errors?.length) {
        return NextResponse.json({
          error: currentEntryData?.errors?.[0]?.message || "Unable to verify current AniList progress",
        }, { status: currentEntryResponse.ok ? 502 : currentEntryResponse.status });
      }

      const media = currentEntryData?.data?.Media;
      const currentProgress = Number(media?.mediaListEntry?.progress || 0);
      resolvedProgress = Math.max(resolvedProgress, currentProgress);

      if (media?.mediaListEntry?.status === "COMPLETED") {
        anilistStatus = "COMPLETED";
      } else if (
        Number.isInteger(media?.episodes) &&
        media.episodes > 0 &&
        resolvedProgress >= media.episodes &&
        media.status === "FINISHED"
      ) {
        anilistStatus = "COMPLETED";
      }
    }

    const variables: Record<string, unknown> = { mediaId };
    if (anilistStatus) variables.status = anilistStatus;
    if (resolvedProgress !== undefined) variables.progress = resolvedProgress;
    if (score !== undefined && score !== null) variables.score = Number(score);

    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ query: mutation, variables }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: "Failed to save entry to AniList", details: errText }, { status: res.status });
    }

    const data = await res.json();

    if (data.errors && data.errors.length > 0) {
      return NextResponse.json({ error: data.errors[0]?.message || "AniList GraphQL error" }, { status: 400 });
    }

    // Invalidate the KV user-list cache so next fetch gets fresh data
    const sessionName = session.user?.name;
    if (sessionName) {
      void kvDelete(`anilist:user-list:name:${sessionName}`);
    }
    if (anilistUserId) {
      void kvDelete(`anilist:user-list:id:${anilistUserId}`);
      void kvDelete(`anilist:release-updates:user:${anilistUserId}`);
    }

    return NextResponse.json({
      success: true,
      entry: data?.data?.SaveMediaListEntry || null,
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const account = await prisma.account.findFirst({
      where: { userId: session.user.id, provider: "anilist" },
      select: { access_token: true, providerAccountId: true },
    });
    const accessToken =
      (session as AniListSession).accessToken || account?.access_token || undefined;
    const anilistUserId =
      account?.providerAccountId || (session as AniListSession).anilistId || null;

    if (!accessToken) {
      return NextResponse.json({ error: "AniList access token missing" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const rawId = searchParams.get("mediaId") || searchParams.get("animeId");
    if (!rawId) {
      return NextResponse.json({ error: "Missing mediaId parameter" }, { status: 400 });
    }

    const mediaId = Number(rawId.replace(/^(anilist|animekai|hianime)~/, ""));
    if (!mediaId || isNaN(mediaId)) {
      return NextResponse.json({ error: "Invalid mediaId" }, { status: 400 });
    }

    // First fetch the media list entry ID for this mediaId
    const query = `
      query ($mediaId: Int) {
        Media (id: $mediaId) {
          mediaListEntry {
            id
          }
        }
      }
    `;

    const getRes = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ query, variables: { mediaId } }),
    });

    const getData = await getRes.json();
    const entryId = getData?.data?.Media?.mediaListEntry?.id;

    if (!entryId) {
      return NextResponse.json({ success: true, message: "Entry was not in AniList list" });
    }

    const deleteMutation = `
      mutation ($id: Int) {
        DeleteMediaListEntry (id: $id) {
          deleted
        }
      }
    `;

    const deleteRes = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ query: deleteMutation, variables: { id: entryId } }),
    });

    const deleteData = await deleteRes.json();

    // Invalidate the KV user-list cache
    const sessionName = session.user?.name;
    if (sessionName) {
      void kvDelete(`anilist:user-list:name:${sessionName}`);
    }
    if (anilistUserId) {
      void kvDelete(`anilist:user-list:id:${anilistUserId}`);
      void kvDelete(`anilist:release-updates:user:${anilistUserId}`);
    }

    return NextResponse.json({
      success: true,
      deleted: deleteData?.data?.DeleteMediaListEntry?.deleted || false,
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
