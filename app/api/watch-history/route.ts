import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { WatchHistory } from "@/lib/anime/watch-history-shared";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

type IncomingHistoryRow = {
  animeId: string;
  episodeNumber: number;
  progress?: number;
  duration?: number;
  title?: string;
  poster?: string | null;
  href?: string;
  provider?: string;
  timestamp?: number;
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function normalizeIncomingRow(value: unknown): IncomingHistoryRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const animeId = String(row.animeId || "").trim();
  const title = String(row.title || "").trim();
  const href = String(row.href || "").trim();
  const provider = String(row.provider || "").trim();
  const episodeNumber = Number(row.episodeNumber || 0);

  if (!animeId || !title || !href || !provider || !Number.isFinite(episodeNumber) || episodeNumber <= 0) {
    return null;
  }

  return {
    animeId,
    episodeNumber,
    progress: clamp(Number(row.progress || 0), 0, 1),
    duration: Math.max(0, Number(row.duration || 0)),
    title,
    poster: row.poster ? String(row.poster) : null,
    href,
    provider,
    timestamp: Math.max(0, Number(row.timestamp || 0)) || undefined,
  };
}

function rowsToHistory(rows: Array<{
  animeId: string;
  episodeNumber: number;
  progress: number;
  duration: number;
  title: string;
  poster: string | null;
  href: string;
  provider: string;
  updatedAt: Date;
}>): WatchHistory {
  const history: WatchHistory = {};

  for (const row of rows) {
    const timestamp = row.updatedAt.getTime();
    if (!history[row.animeId]) {
      history[row.animeId] = {
        title: row.title,
        poster: row.poster,
        href: row.href,
        provider: row.provider,
        lastEpisode: row.episodeNumber,
        lastUpdated: timestamp,
        episodes: {},
      };
    }

    history[row.animeId].episodes[String(row.episodeNumber)] = {
      progress: row.progress,
      duration: row.duration,
      timestamp,
    };

    if (timestamp >= history[row.animeId].lastUpdated) {
      history[row.animeId].lastUpdated = timestamp;
      history[row.animeId].lastEpisode = row.episodeNumber;
      history[row.animeId].title = row.title;
      history[row.animeId].poster = row.poster;
      history[row.animeId].href = row.href;
      history[row.animeId].provider = row.provider;
    }
  }

  return history;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await prisma.watchHistory.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({
    history: rowsToHistory(rows),
  });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const body = await request.json().catch(() => null);
  const entries = Array.isArray(body?.entries)
    ? body.entries.map(normalizeIncomingRow).filter(Boolean) as IncomingHistoryRow[]
    : [normalizeIncomingRow(body)].filter(Boolean) as IncomingHistoryRow[];

  if (entries.length === 0) {
    return NextResponse.json({ error: "No valid history entries provided" }, { status: 400 });
  }

  const animeIds = Array.from(new Set(entries.map((entry) => entry.animeId)));
  const existingRows = await prisma.watchHistory.findMany({
    where: {
      userId: session.user.id,
      animeId: { in: animeIds },
    },
    select: {
      animeId: true,
      episodeNumber: true,
      updatedAt: true,
    },
  });

  const existingMap = new Map(
    existingRows.map((row) => [`${row.animeId}:${row.episodeNumber}`, row]),
  );

  const operations: Prisma.PrismaPromise<unknown>[] = [];

  for (const entry of entries) {
    const existing = existingMap.get(`${entry.animeId}:${entry.episodeNumber}`);
    if (existing && entry.timestamp && existing.updatedAt.getTime() > entry.timestamp) {
      continue;
    }

    operations.push(
      prisma.watchHistory.upsert({
        where: {
          userId_animeId_episodeNumber: {
            userId,
            animeId: entry.animeId,
            episodeNumber: entry.episodeNumber,
          },
        },
        create: {
          userId,
          animeId: entry.animeId,
          episodeNumber: entry.episodeNumber,
          progress: entry.progress ?? 0,
          duration: entry.duration ?? 0,
          title: entry.title || "Unknown anime",
          poster: entry.poster || null,
          href: entry.href || `/anime/${entry.animeId}`,
          provider: entry.provider || "animekai",
        },
        update: {
          progress: entry.progress ?? 0,
          duration: entry.duration ?? 0,
          title: entry.title || "Unknown anime",
          poster: entry.poster || null,
          href: entry.href || `/anime/${entry.animeId}`,
          provider: entry.provider || "animekai",
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

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const animeId = request.nextUrl.searchParams.get("animeId");
  if (animeId) {
    await prisma.watchHistory.deleteMany({
      where: {
        userId: session.user.id,
        animeId,
      },
    });
    return NextResponse.json({ success: true, animeId });
  }

  await prisma.watchHistory.deleteMany({
    where: { userId: session.user.id },
  });

  return NextResponse.json({ success: true, cleared: true });
}
