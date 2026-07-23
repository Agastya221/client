import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getAnilistListEntry } from "@/lib/anilist/user";
import { fromAnilistListStatus } from "@/lib/anilist/list-status";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ entry: null }, { status: 401 });
  }

  const mediaId = Number(new URL(request.url).searchParams.get("mediaId"));
  if (!Number.isInteger(mediaId) || mediaId <= 0) {
    return NextResponse.json({ error: "Invalid mediaId" }, { status: 400 });
  }

  const account = await prisma.account.findFirst({
    where: {
      userId: session.user.id,
      provider: "anilist",
    },
    select: { access_token: true },
  });

  if (!account?.access_token) {
    return NextResponse.json({ entry: null }, { status: 401 });
  }

  try {
    const entry = await getAnilistListEntry(account.access_token, mediaId);
    return NextResponse.json(
      {
        entry: entry
          ? {
              id: entry.id,
              status: fromAnilistListStatus(entry.status),
              progress: Math.max(0, Number(entry.progress || 0)),
              score: entry.score ?? null,
            }
          : null,
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (error) {
    console.error("[anilist-list-entry] Error:", error);
    return NextResponse.json({ error: "Unable to read AniList status" }, { status: 502 });
  }
}
