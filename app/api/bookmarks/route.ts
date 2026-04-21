import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { rateLimit, getRateLimitHeaders } from "@/lib/rate-limit";

type IncomingBookmarkRow = {
  animeId: string;
  title: string;
  poster: string | null;
  href: string;
  status: string;
  timestamp?: number;
};

function normalizeIncomingBookmark(value: unknown): IncomingBookmarkRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const animeId = String(row.animeId || "").trim();
  const title = String(row.title || "").trim();
  const href = String(row.href || "").trim();

  if (!animeId || !title || !href) {
    return null;
  }

  return {
    animeId,
    title,
    poster: row.poster ? String(row.poster) : null,
    href,
    status: String(row.status || "PLAN_TO_WATCH"),
    timestamp: Math.max(0, Number(row.timestamp || 0)) || undefined,
  };
}

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
  const userId = session.user.id;

  const ip = req.headers.get("x-forwarded-for") || "unknown";
  const rl = rateLimit(`bookmark:${ip}`, 30);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: getRateLimitHeaders(rl) }
    );
  }

  const body = await req.json().catch(() => null);
  const entries = Array.isArray(body?.entries)
    ? body.entries.map(normalizeIncomingBookmark).filter(Boolean) as IncomingBookmarkRow[]
    : [normalizeIncomingBookmark(body)].filter(Boolean) as IncomingBookmarkRow[];

  if (entries.length === 0) {
    return NextResponse.json({ error: "No valid bookmark entries provided" }, { status: 400 });
  }

  const animeIds = Array.from(new Set(entries.map((entry) => entry.animeId)));
  const existingRows = await prisma.bookmark.findMany({
    where: {
      userId,
      animeId: { in: animeIds },
    },
    select: {
      animeId: true,
      updatedAt: true,
    },
  });

  const existingMap = new Map(existingRows.map((row) => [row.animeId, row.updatedAt]));
  const operations: Prisma.PrismaPromise<unknown>[] = [];

  for (const entry of entries) {
    const existingUpdatedAt = existingMap.get(entry.animeId);
    if (existingUpdatedAt && entry.timestamp && existingUpdatedAt.getTime() > entry.timestamp) {
      continue;
    }

    operations.push(
      prisma.bookmark.upsert({
        where: {
          userId_animeId: { userId, animeId: entry.animeId },
        },
        create: {
          userId,
          animeId: entry.animeId,
          title: entry.title,
          poster: entry.poster,
          href: entry.href,
          status: entry.status || "PLAN_TO_WATCH",
        },
        update: {
          title: entry.title,
          poster: entry.poster,
          href: entry.href,
          status: entry.status || undefined,
        },
      }),
    );
  }

  if (operations.length > 0) {
    await prisma.$transaction(operations);
  }

  return NextResponse.json({
    imported: operations.length,
    skipped: entries.length - operations.length,
  });
}

// DELETE /api/bookmarks?animeId=xxx — remove a bookmark
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const animeId = req.nextUrl.searchParams.get("animeId");
  if (animeId) {
    await prisma.bookmark.deleteMany({
      where: { userId: session.user.id, animeId },
    });
    return NextResponse.json({ success: true, animeId });
  }

  await prisma.bookmark.deleteMany({
    where: { userId: session.user.id },
  });

  return NextResponse.json({ success: true, cleared: true });
}
