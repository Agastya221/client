import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusable chars
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function getRoomExpiry(): Date {
  const d = new Date();
  d.setHours(d.getHours() + 6);
  return d;
}

// POST /api/watch-party/room — create a room
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      hostId: string;
      hostName: string;
      animeId: string;
      animeTitle: string;
      animePoster?: string;
      episodeNumber: number;
    };

    const { hostId, hostName, animeId, animeTitle, animePoster, episodeNumber } = body;

    if (!hostId || !animeId || !animeTitle) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Generate a unique code (retry up to 5 times on collision)
    let code = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      code = generateRoomCode();
      const existing = await prisma.watchPartyRoom.findUnique({ where: { code } });
      if (!existing) break;
    }

    const members = [{ id: hostId, name: hostName, isHost: true, joinedAt: new Date().toISOString() }];

    const room = await prisma.watchPartyRoom.create({
      data: {
        code,
        hostId,
        animeId,
        animeTitle,
        animePoster: animePoster || null,
        episodeNumber: episodeNumber || 1,
        currentTime: 0,
        isPlaying: false,
        members,
        expiresAt: getRoomExpiry(),
        lastActivityAt: new Date(),
      },
    });

    return NextResponse.json({ code: room.code, room });
  } catch (err) {
    console.error("[watch-party/room POST]", err);
    return NextResponse.json({ error: "Failed to create room" }, { status: 500 });
  }
}

// GET /api/watch-party/room?code=ANIM4X — fetch room state
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });

  try {
    const room = await prisma.watchPartyRoom.findUnique({ where: { code: code.toUpperCase() } });
    if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });
    if (room.expiresAt < new Date()) {
      await prisma.watchPartyRoom.delete({ where: { code } }).catch(() => undefined);
      return NextResponse.json({ error: "Room expired" }, { status: 404 });
    }
    return NextResponse.json(room);
  } catch {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }
}

// DELETE /api/watch-party/room?code=ANIM4X&hostId=xxx — destroy room (host only)
export async function DELETE(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code")?.toUpperCase();
  const hostId = req.nextUrl.searchParams.get("hostId");
  if (!code || !hostId) return NextResponse.json({ error: "Missing params" }, { status: 400 });

  try {
    const room = await prisma.watchPartyRoom.findUnique({ where: { code } });
    if (!room) return NextResponse.json({ success: true });
    if (room.hostId !== hostId) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    await prisma.watchPartyEvent.create({
      data: {
        roomCode: code,
        memberId: hostId,
        memberName: "Host",
        type: "room_closed",
        payload: { message: "Host closed the room" },
      },
    });

    await prisma.watchPartyRoom.delete({ where: { code } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
