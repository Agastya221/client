import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getRateLimitHeaders } from "@/lib/rate-limit";

// GET /api/bookmarks — get user's bookmarks
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bookmarks = await prisma.bookmark.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(bookmarks);
}

// POST /api/bookmarks — add/update a bookmark
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = req.headers.get("x-forwarded-for") || "unknown";
  const rl = rateLimit(`bookmark:${ip}`, 30);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: getRateLimitHeaders(rl) }
    );
  }

  const body = await req.json();
  const { animeId, title, poster, href, status } = body;

  if (!animeId || !title || !href) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const bookmark = await prisma.bookmark.upsert({
    where: {
      userId_animeId: { userId: session.user.id, animeId },
    },
    create: {
      userId: session.user.id,
      animeId,
      title,
      poster: poster || null,
      href,
      status: status || "WATCHING",
    },
    update: {
      title,
      poster: poster || null,
      href,
      status: status || undefined,
    },
  });

  return NextResponse.json(bookmark);
}

// DELETE /api/bookmarks?animeId=xxx — remove a bookmark
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const animeId = req.nextUrl.searchParams.get("animeId");
  if (!animeId) {
    return NextResponse.json({ error: "Missing animeId" }, { status: 400 });
  }

  await prisma.bookmark.deleteMany({
    where: { userId: session.user.id, animeId },
  });

  return NextResponse.json({ success: true });
}
