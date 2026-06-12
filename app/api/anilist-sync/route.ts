/**
 * POST /api/anilist-sync
 *
 * Updates the user's episode progress on AniList.
 * Called by the watch player after the user completes an episode.
 *
 * Body: { mediaId: number, progress: number }
 *
 * Silently succeeds/fails — never blocks the player.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { updateAnilistProgress } from "@/lib/anilist/user";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, reason: "not_authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const mediaId = Number(body.mediaId);
    const progress = Number(body.progress);

    if (!Number.isInteger(mediaId) || mediaId <= 0 || !Number.isInteger(progress) || progress < 0) {
      return NextResponse.json({ ok: false, reason: "invalid_params" }, { status: 400 });
    }

    // Look up AniList access token for this user
    const account = await prisma.account.findFirst({
      where: {
        userId: session.user.id,
        provider: "anilist",
      },
      select: { access_token: true },
    });

    if (!account?.access_token) {
      return NextResponse.json({ ok: false, reason: "no_anilist_account" });
    }

    const ok = await updateAnilistProgress(account.access_token, mediaId, progress);
    return NextResponse.json({ ok });
  } catch (error) {
    console.error("[anilist-sync] Error:", error);
    return NextResponse.json({ ok: false, reason: "internal_error" }, { status: 500 });
  }
}
