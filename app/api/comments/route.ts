import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getRateLimitHeaders } from "@/lib/rate-limit";

// GET /api/comments?animeId=xxx&episode=1
export async function GET(req: NextRequest) {
  const animeId = req.nextUrl.searchParams.get("animeId");
  const episode = req.nextUrl.searchParams.get("episode");

  if (!animeId) {
    return NextResponse.json({ error: "Missing animeId" }, { status: 400 });
  }

  const where: Record<string, unknown> = {
    animeId,
    parentId: null, // top-level only
  };
  if (episode) where.episodeNumber = parseInt(episode, 10);

  const comments = await prisma.comment.findMany({
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

  return NextResponse.json(comments);
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
