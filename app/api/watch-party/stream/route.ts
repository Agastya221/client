import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/watch-party/stream?code=ANIM4X&memberId=uuid
// Long-lived SSE endpoint. Polls new events every 800ms and pushes them.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code")?.toUpperCase();
  const memberId = req.nextUrl.searchParams.get("memberId");

  if (!code || !memberId) {
    return new Response("Missing code or memberId", { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let lastEventId: string | null = null;
      let alive = true;
      let pingTimer: ReturnType<typeof setTimeout> | null = null;
      let pollTimer: ReturnType<typeof setTimeout> | null = null;

      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          alive = false;
        }
      };

      const cleanup = () => {
        alive = false;
        if (pingTimer) clearTimeout(pingTimer);
        if (pollTimer) clearTimeout(pollTimer);
      };

      req.signal.addEventListener("abort", cleanup);

      // Send initial room state
      try {
        const room = await prisma.watchPartyRoom.findUnique({ where: { code } });
        if (!room || room.expiresAt < new Date()) {
          send("error", { message: "Room not found or expired" });
          controller.close();
          return;
        }
        send("connected", {
          room: {
            code: room.code,
            animeId: room.animeId,
            animeTitle: room.animeTitle,
            episodeNumber: room.episodeNumber,
            currentTime: room.currentTime,
            isPlaying: room.isPlaying,
            members: room.members,
          },
        });
      } catch {
        send("error", { message: "DB error" });
        controller.close();
        return;
      }

      // Ping every 20s to keep connection alive
      const schedulePing = () => {
        pingTimer = setTimeout(() => {
          if (!alive) return;
          try {
            controller.enqueue(encoder.encode(": ping\n\n"));
          } catch {
            alive = false;
          }
          if (alive) schedulePing();
        }, 20_000);
      };
      schedulePing();

      // Poll for new events every 800ms
      const poll = async () => {
        if (!alive) return;
        try {
          const where = lastEventId
            ? { roomCode: code, id: { gt: lastEventId } }
            : { roomCode: code, createdAt: { gte: new Date(Date.now() - 2000) } };

          const events = await prisma.watchPartyEvent.findMany({
            where,
            orderBy: { createdAt: "asc" },
            take: 20,
          });

          for (const ev of events) {
            // Don't echo back to the sender for play/pause/seek
            if (["play", "pause", "seek"].includes(ev.type) && ev.memberId === memberId) {
              lastEventId = ev.id;
              continue;
            }
            send(ev.type, {
              id: ev.id,
              memberId: ev.memberId,
              memberName: ev.memberName,
              payload: ev.payload,
              ts: ev.createdAt.toISOString(),
            });
            lastEventId = ev.id;
          }
        } catch {
          // DB hiccup — skip, retry next poll
        }

        if (alive) {
          pollTimer = setTimeout(poll, 800);
        }
      };

      poll();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
