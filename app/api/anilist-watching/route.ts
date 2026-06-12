/**
 * GET /api/anilist-watching
 *
 * Returns the logged-in user's AniList "CURRENT" watching list.
 * Used by the ContinueWatchingRail to show anime the user is currently watching
 * on AniList (synced from any site that writes to AniList).
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getAnilistViewerId, getAnilistWatchingList } from "@/lib/anilist/user";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ entries: [] });
    }

    // Check if user has an AniList account linked
    const account = await prisma.account.findFirst({
      where: {
        userId: session.user.id,
        provider: "anilist",
      },
      select: { access_token: true, providerAccountId: true },
    });

    if (!account?.access_token) {
      return NextResponse.json({ entries: [] });
    }

    // Use stored provider account ID as AniList user ID
    const userId = Number(account.providerAccountId);
    if (!Number.isInteger(userId) || userId <= 0) {
      return NextResponse.json({ entries: [] });
    }

    const entries = await getAnilistWatchingList(account.access_token, userId);
    return NextResponse.json({ entries });
  } catch (error) {
    console.error("[anilist-watching] Error:", error);
    return NextResponse.json({ entries: [] });
  }
}
