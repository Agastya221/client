import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

// POST /api/watch-party/event — broadcast a sync event
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      code: string;
      memberId: string;
      memberName: string;
      type: "play" | "pause" | "seek" | "episode" | "chat";
      payload: Record<string, unknown>;
    };

    const { code, memberId, memberName, type, payload } = body;
    if (!code || !memberId || !type) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const roomCode = code.toUpperCase();

    // Update room state for stateful events
    const roomUpdate: Record<string, unknown> = { lastActivityAt: new Date() };
    if (type === "play") {
      roomUpdate.isPlaying = true;
      if (typeof payload.time === "number") roomUpdate.currentTime = payload.time;
    } else if (type === "pause") {
      roomUpdate.isPlaying = false;
      if (typeof payload.time === "number") roomUpdate.currentTime = payload.time;
    } else if (type === "seek") {
      if (typeof payload.time === "number") roomUpdate.currentTime = payload.time;
    } else if (type === "episode" || (type as string) === "server") {
      if (typeof payload.episodeNumber === "number") roomUpdate.episodeNumber = payload.episodeNumber;
      if (typeof payload.time === "number") roomUpdate.currentTime = payload.time;
      if (typeof payload.isPlaying === "boolean") roomUpdate.isPlaying = payload.isPlaying;
    }

    await prisma.watchPartyRoom.update({
      where: { code: roomCode },
      data: roomUpdate as Parameters<typeof prisma.watchPartyRoom.update>[0]["data"],
    });

    // Write the event so SSE clients pick it up
    await prisma.watchPartyEvent.create({
      data: { roomCode, memberId, memberName, type, payload: payload as Parameters<typeof prisma.watchPartyEvent.create>[0]["data"]["payload"] },
    });

    // Clean up stale events (older than 90s) opportunistically
    await prisma.watchPartyEvent.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - 90_000) } },
    }).catch(() => undefined);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[watch-party/event POST]", err);
    return NextResponse.json({ error: "Failed to broadcast event" }, { status: 500 });
  }
}
