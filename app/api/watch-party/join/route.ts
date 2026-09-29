import { watchPartyUnavailable } from "@/lib/features";
import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

// POST /api/watch-party/join — add a member to a room
export async function POST(req: NextRequest) {
  const unavailable = watchPartyUnavailable();
  if (unavailable) return unavailable;
  try {
    const body = await req.json() as { code: string; memberId: string; memberName: string };
    const { code, memberId, memberName } = body;

    if (!code || !memberId || !memberName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const room = await prisma.watchPartyRoom.findUnique({ where: { code: code.toUpperCase() } });
    if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });
    if (room.expiresAt < new Date()) return NextResponse.json({ error: "Room expired" }, { status: 404 });

    const members = room.members as Array<{ id: string; name: string; isHost?: boolean; joinedAt: string }>;

    // Don't re-add if already in
    const alreadyIn = members.some((m) => m.id === memberId);
    if (!alreadyIn) {
      if (members.length >= 20) {
        return NextResponse.json({ error: "Room is full (max 20 members)" }, { status: 409 });
      }
      members.push({ id: memberId, name: memberName, joinedAt: new Date().toISOString() });
    }

    const updated = await prisma.watchPartyRoom.update({
      where: { code: code.toUpperCase() },
      data: {
        members,
        lastActivityAt: new Date(),
        expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
      },
    });

    // Broadcast join event
    await prisma.watchPartyEvent.create({
      data: {
        roomCode: code.toUpperCase(),
        memberId,
        memberName,
        type: "join",
        payload: { memberName },
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[watch-party/join POST]", err);
    return NextResponse.json({ error: "Failed to join room" }, { status: 500 });
  }
}

// DELETE /api/watch-party/join?code=XXX&memberId=YYY — leave a room
export async function DELETE(req: NextRequest) {
  const unavailable = watchPartyUnavailable();
  if (unavailable) return unavailable;
  const code = req.nextUrl.searchParams.get("code")?.toUpperCase();
  const memberId = req.nextUrl.searchParams.get("memberId");
  const memberName = req.nextUrl.searchParams.get("memberName") ?? "Someone";

  if (!code || !memberId) return NextResponse.json({ error: "Missing params" }, { status: 400 });

  try {
    const room = await prisma.watchPartyRoom.findUnique({ where: { code } });
    if (!room) return NextResponse.json({ success: true }); // already gone

    const isHostLeaving = room.hostId === memberId;
    const remainingMembers = (room.members as Array<{ id: string; name: string }>).filter((m) => m.id !== memberId);

    // If host leaves or room becomes empty, close and delete the room completely
    if (isHostLeaving || remainingMembers.length === 0) {
      await prisma.watchPartyEvent.create({
        data: {
          roomCode: code,
          memberId,
          memberName,
          type: "room_closed",
          payload: { memberName, message: "Host closed the room" },
        },
      });

      await prisma.watchPartyRoom.delete({ where: { code } }).catch(() => undefined);
      return NextResponse.json({ success: true, roomClosed: true });
    }

    // Regular guest leaving
    await prisma.watchPartyRoom.update({
      where: { code },
      data: { members: remainingMembers, lastActivityAt: new Date() },
    });

    await prisma.watchPartyEvent.create({
      data: {
        roomCode: code,
        memberId,
        memberName,
        type: "leave",
        payload: { memberName },
      },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: true });
  }
}
