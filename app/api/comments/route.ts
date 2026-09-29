import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getRateLimitHeaders } from "@/lib/rate-limit";
import { unstable_cache } from "next/cache";
import { anilistFetch } from "@/lib/anilist/endpoint";

// TTL for AniList comment cache (5 min)
const CACHE_TTL_SECONDS = 5 * 60;

async function fetchAniListComments(animeId: string, episodeNumber?: number): Promise<any[]> {
  const rawId = parseInt(animeId.replace(/^anilist~/i, ""), 10);
  if (isNaN(rawId)) return [];

  // Use unstable_cache for persistent server-side caching (free, built-in, survives cold starts)
  const cachedFetch = unstable_cache(
    async () => _fetchFromAniList(animeId, rawId, episodeNumber),
    [`anilist-comments-${rawId}-${episodeNumber ?? "all"}`],
    { revalidate: CACHE_TTL_SECONDS }
  );
  return cachedFetch();
}

async function _fetchFromAniList(animeId: string, rawId: number, episodeNumber?: number): Promise<any[]> {
  const threadQuery = `
    query ($mediaId: Int) {
      Page(page: 1, perPage: 30) {
        threads(mediaCategoryId: $mediaId, sort: ID_DESC) {
          id
          title
          body
          createdAt
          replyCount
          user { id name avatar { medium } }
        }
      }
    }
  `;

  try {
    const res = await anilistFetch({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: threadQuery, variables: { mediaId: rawId } }),
    });

    if (!res.ok) return [];
    const json = await res.json();
    const threads = json?.data?.Page?.threads || [];

    const matchingThreads = episodeNumber
      ? threads.filter((t: any) => {
          const titleLower = (t.title || "").toLowerCase();
          return (
            titleLower.includes(`episode ${episodeNumber}`) ||
            titleLower.includes(`ep ${episodeNumber}`) ||
            titleLower.includes(`ep.${episodeNumber}`) ||
            titleLower.includes(`episode ${episodeNumber} `) ||
            titleLower.includes(`ep ${episodeNumber} `)
          );
        })
      : threads;

    if (episodeNumber && matchingThreads.length === 0) {
      return [];
    }

    const targetThread = matchingThreads[0] || threads[0];
    const results: any[] = [];

    const formatComment = (id: string, text: string, user: any, createdAt: number, isSpoilerTitle = false) => {
      let cleanContent = (text || "")
        .replace(/~!|!~/g, "")
        .replace(/~~~[\s\S]*?~~~/g, "")
        .replace(/\[SOURCE\]\(.*?\)/gi, "")
        .replace(/youtube\((.*?)\)/gi, "")
        .replace(/webm\((.*?)\)/gi, "")
        .replace(/<.*?>/g, "")
        .replace(/\[\/?(b|i|u|quote|code).*?\]/gi, "")
        .trim();

      const isSpoiler = Boolean(isSpoilerTitle || (text || "").includes("~!") || (text || "").toLowerCase().includes("spoiler"));

      return {
        id,
        userId: `anilist-user-${user?.id || "anon"}`,
        animeId,
        episodeNumber: episodeNumber || null,
        content: cleanContent,
        isSpoiler,
        timestamp: null,
        parentId: null,
        createdAt: createdAt ? new Date(createdAt * 1000).toISOString() : new Date().toISOString(),
        user: {
          id: `anilist-user-${user?.id || "anon"}`,
          name: user?.name || "Anime Fan",
          image: user?.avatar?.medium || "https://anilist.co/img/icons/android-chrome-512x512.png",
        },
        likes: [],
        replies: [],
      };
    };

    if (targetThread && targetThread.body) {
      const isSpoilerTitle = Boolean((targetThread.title || "").toLowerCase().includes("spoiler"));
      results.push(formatComment(`anilist-thread-${targetThread.id}`, targetThread.body, targetThread.user, targetThread.createdAt, isSpoilerTitle));
    }

    if (targetThread?.id) {
      const commentQuery = `
        query ($threadId: Int) {
          Page(page: 1, perPage: 25) {
            threadComments(threadId: $threadId) {
              id
              comment
              createdAt
              likeCount
              user { id name avatar { medium } }
            }
          }
        }
      `;

      try {
        const resComments = await anilistFetch({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: commentQuery, variables: { threadId: targetThread.id } }),
        });

        if (resComments.ok) {
          const jsonComments = await resComments.json();
          const threadComments = jsonComments?.data?.Page?.threadComments || [];
          for (const c of threadComments) {
            if (c.comment?.trim()) {
              results.push(formatComment(`anilist-comment-${c.id}`, c.comment, c.user, c.createdAt));
            }
          }
        }
      } catch {
        // silent
      }
    }

    // Cache is handled by unstable_cache wrapper — just return
    return results;
  } catch {
    return [];
  }
}

// GET /api/comments?animeId=xxx&episode=1
export async function GET(req: NextRequest) {
  const animeId = req.nextUrl.searchParams.get("animeId");
  const episodeStr = req.nextUrl.searchParams.get("episode");

  if (!animeId) {
    return NextResponse.json({ error: "Missing animeId" }, { status: 400 });
  }

  const episodeNumber = episodeStr ? parseInt(episodeStr, 10) : undefined;

  try {
    const where: Record<string, unknown> = {
      animeId,
      parentId: null, // top-level only
    };
    if (episodeNumber) where.episodeNumber = episodeNumber;

    let localComments: any[] = [];
    try {
      localComments = await prisma.comment.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, image: true } },
          likes: { select: { userId: true } },
          replies: {
            include: {
              user: { select: { id: true, name: true, image: true } },
              likes: { select: { userId: true } },
            },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
    } catch {
      localComments = [];
    }

    // Fetch AniList Community discussion comments for this specific episode/anime
    const anilistComments = await fetchAniListComments(animeId, episodeNumber);

    // Combine local DB comments + AniList Community comments into one seamless feed
    const combined = [...localComments, ...anilistComments];

    return NextResponse.json(combined);
  } catch {
    return NextResponse.json([]);
  }
}

// POST /api/comments — create a comment
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = req.headers.get("x-forwarded-for") || "unknown";
  const rl = rateLimit(`comment-post:${ip}`, 20);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: getRateLimitHeaders(rl) }
    );
  }

  const body = await req.json();
  const { animeId, episodeNumber, content, isSpoiler, timestamp, parentId } = body;

  if (!animeId || !content?.trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (content.trim().length > 2000) {
    return NextResponse.json({ error: "Comment too long (max 2000 chars)" }, { status: 400 });
  }

  const comment = await prisma.comment.create({
    data: {
      userId: session.user.id,
      animeId,
      episodeNumber: episodeNumber || null,
      content: content.trim(),
      isSpoiler: isSpoiler || false,
      timestamp: timestamp || null,
      parentId: parentId || null,
    },
    include: {
      user: { select: { id: true, name: true, image: true } },
      likes: { select: { userId: true } },
      replies: {
        include: {
          user: { select: { id: true, name: true, image: true } },
          likes: { select: { userId: true } },
        },
      },
    },
  });

  return NextResponse.json(comment, { status: 201 });
}

// DELETE /api/comments?id=xxx — delete own comment
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const comment = await prisma.comment.findUnique({ where: { id } });
  if (!comment || comment.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found or unauthorized" }, { status: 403 });
  }

  await prisma.comment.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
