import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { kvDelete } from "@/lib/cache/kv";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized: Please sign in with AniList" }, { status: 401 });
    }

    let accessToken = (session as any).accessToken;

    // Fallback: Check PostgreSQL database Account table if token is missing in JWT
    if (!accessToken) {
      const account = await prisma.account.findFirst({
        where: {
          userId: session.user.id,
          provider: "anilist",
        },
        select: {
          access_token: true,
        },
      });

      if (account?.access_token) {
        accessToken = account.access_token;
      }
    }

    if (!accessToken) {
      return NextResponse.json({
        error: "AniList access token missing. Please sign out and sign in with AniList again.",
      }, { status: 401 });
    }

    const body = await request.json();
    const { animeId, rawMediaId, status, progress, score } = body;

    let mediaId = rawMediaId ? Number(rawMediaId) : null;
    if (!mediaId && animeId) {
      const cleaned = String(animeId).replace(/^(anilist|animekai|hianime)~/, "");
      mediaId = Number(cleaned);
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

    const variables: Record<string, any> = { mediaId };
    if (anilistStatus) variables.status = anilistStatus;
    if (progress !== undefined && progress !== null) variables.progress = Number(progress);
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
    const sessionName = (session as any)?.user?.name;
    if (sessionName) {
      void kvDelete(`anilist:user-list:name:${sessionName}`);
    }

    return NextResponse.json({
      success: true,
      entry: data?.data?.SaveMediaListEntry || null,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let accessToken = (session as any).accessToken;
    if (!accessToken) {
      const account = await prisma.account.findFirst({
        where: { userId: session.user.id, provider: "anilist" },
        select: { access_token: true },
      });
      if (account?.access_token) accessToken = account.access_token;
    }

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
    const sessionName = (session as any)?.user?.name;
    if (sessionName) {
      void kvDelete(`anilist:user-list:name:${sessionName}`);
    }

    return NextResponse.json({
      success: true,
      deleted: deleteData?.data?.DeleteMediaListEntry?.deleted || false,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Internal Server Error" }, { status: 500 });
  }
}
