import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

// POST /api/comments/like — toggle like on a comment
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { commentId } = await req.json();
  if (!commentId) {
    return NextResponse.json({ error: "Missing commentId" }, { status: 400 });
  }

  // Toggle: if already liked, remove it; otherwise add
  const existing = await prisma.commentLike.findUnique({
    where: {
      userId_commentId: { userId: session.user.id, commentId },
    },
  });

  if (existing) {
    await prisma.commentLike.delete({
      where: { id: existing.id },
    });
    return NextResponse.json({ liked: false });
  }

  await prisma.commentLike.create({
    data: {
      userId: session.user.id,
      commentId,
    },
  });

  return NextResponse.json({ liked: true });
}
