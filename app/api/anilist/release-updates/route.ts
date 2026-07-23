import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { kvCached } from "@/lib/cache/kv";
import { getAnilistFollowedReleaseEntries } from "@/lib/anilist/user";
import { buildFollowedReleaseUpdates } from "@/lib/anilist/release-updates";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ updates: [] });
  }

  const account = await prisma.account.findFirst({
    where: {
      userId: session.user.id,
      provider: "anilist",
    },
    select: {
      access_token: true,
      providerAccountId: true,
    },
  });

  const userId = Number(account?.providerAccountId);
  if (!account?.access_token || !Number.isInteger(userId) || userId <= 0) {
    return NextResponse.json({ updates: [] });
  }

  try {
    const updates = await kvCached(
      `anilist:release-updates:user:${userId}`,
      async () => {
        const entries = await getAnilistFollowedReleaseEntries(account.access_token!, userId);
        return buildFollowedReleaseUpdates(entries);
      },
      300,
    );

    return NextResponse.json(
      { updates },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (error) {
    console.error("[anilist-release-updates] Error:", error);
    return NextResponse.json({ updates: [] });
  }
}
