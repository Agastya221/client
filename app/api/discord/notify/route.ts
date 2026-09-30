import { NextResponse } from "next/server";
import { notifyNewEpisodeToDiscord, sendDiscordWebhook } from "@/lib/discord";

export async function POST(req: Request) {
  try {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

    if (!webhookUrl) {
      return NextResponse.json(
        { error: "DISCORD_WEBHOOK_URL is not set in environment variables (.env)." },
        { status: 400 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const { title, episodeNumber, coverUrl, watchLink, message } = body || {};

    if (message) {
      const res = await sendDiscordWebhook(webhookUrl, {
        content: message,
        username: "Anime Site Updates",
      });

      if (!res.success) {
        return NextResponse.json({ error: res.error }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: "Webhook sent!" });
    }

    if (!title || !episodeNumber) {
      return NextResponse.json(
        { error: "Missing required fields: title, episodeNumber" },
        { status: 400 },
      );
    }

    const res = await notifyNewEpisodeToDiscord(webhookUrl, {
      title,
      episodeNumber,
      coverUrl,
      watchLink: watchLink || process.env.NEXT_PUBLIC_SITE_URL,
      siteName: "YoruMi",
    });

    if (!res.success) {
      return NextResponse.json({ error: res.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Episode notification sent to Discord!" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
