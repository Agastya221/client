import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

// GET /api/watch-party/rooms — list all active (non-expired) rooms
export async function GET() {
  try {
    const now = new Date();
    const rooms = await prisma.watchPartyRoom.findMany({
      where: {
        expiresAt: { gt: now },
      },
      orderBy: { lastActivityAt: "desc" },
      take: 50,
      select: {
        code: true,
        animeId: true,
        animeTitle: true,
        animePoster: true,
        episodeNumber: true,
        isPlaying: true,
        members: true,
        createdAt: true,
        lastActivityAt: true,
      },
    });

    // Parse members to get count
    const result = rooms.map((room) => {
      const members = Array.isArray(room.members) ? room.members : [];
      return {
        code: room.code,
        animeId: room.animeId,
        animeTitle: room.animeTitle,
        animePoster: room.animePoster,
        episodeNumber: room.episodeNumber,
        isPlaying: room.isPlaying,
        memberCount: members.length,
        createdAt: room.createdAt.toISOString(),
        lastActivityAt: room.lastActivityAt.toISOString(),
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[watch-party/rooms GET]", err);
    return NextResponse.json([], { status: 200 });
  }
}
