/**
 * Discord Integration Module for Anime Website
 *
 * Provides utilities for:
 * 1. Sending anime release notifications / announcements via Discord Webhook.
 * 2. Auto-creating server channels & categories using a Discord Bot Token.
 */

export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number; // Hex integer, e.g. 0x8a2be2 for purple/anime theme
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  thumbnail?: { url: string };
  image?: { url: string };
  footer?: { text: string; icon_url?: string };
  timestamp?: string;
}

export interface SendWebhookOptions {
  content?: string;
  username?: string;
  avatarUrl?: string;
  embeds?: DiscordEmbed[];
}

/**
 * Sends a message/embed to a Discord channel using a Webhook URL.
 */
export async function sendDiscordWebhook(
  webhookUrl: string,
  options: SendWebhookOptions,
): Promise<{ success: boolean; error?: string }> {
  if (!webhookUrl) {
    return { success: false, error: "Webhook URL is missing." };
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: options.content,
        username: options.username || "Anime Updates",
        avatar_url: options.avatarUrl,
        embeds: options.embeds,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `Discord HTTP ${res.status}: ${text}` };
    }

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

/**
 * Sends a pre-styled "New Episode Released" card to Discord.
 */
export async function notifyNewEpisodeToDiscord(
  webhookUrl: string,
  anime: {
    title: string;
    episodeNumber: number | string;
    coverUrl?: string;
    watchLink?: string;
    siteName?: string;
  },
) {
  const embed: DiscordEmbed = {
    title: `🎬 New Episode Alert: ${anime.title}`,
    description: `**Episode ${anime.episodeNumber}** is now available to watch!`,
    url: anime.watchLink,
    color: 0x9333ea, // Vibrant purple
    thumbnail: anime.coverUrl ? { url: anime.coverUrl } : undefined,
    fields: [
      { name: "Episode", value: `Episode ${anime.episodeNumber}`, inline: true },
      { name: "Watch Now", value: anime.watchLink ? `[Click here to watch](${anime.watchLink})` : "Available on site", inline: true },
    ],
    footer: {
      text: anime.siteName || "Anime Streaming Site",
    },
    timestamp: new Date().toISOString(),
  };

  return sendDiscordWebhook(webhookUrl, {
    username: anime.siteName || "Anime Notifier",
    embeds: [embed],
  });
}

/**
 * Channel structure definition for automated Discord server setup.
 */
export const RECOMMENDED_DISCORD_CHANNELS = [
  { name: "INFORMATION", type: 4 }, // Category
  { name: "announcements", type: 0, parent: "INFORMATION" },
  { name: "rules", type: 0, parent: "INFORMATION" },
  { name: "release-feed", type: 0, parent: "INFORMATION" },
  
  { name: "COMMUNITY", type: 4 }, // Category
  { name: "general-chat", type: 0, parent: "COMMUNITY" },
  { name: "anime-discussion", type: 0, parent: "COMMUNITY" },
  { name: "spoiler-zone", type: 0, parent: "COMMUNITY" },

  { name: "SUPPORT", type: 4 }, // Category
  { name: "site-feedback", type: 0, parent: "SUPPORT" },
  { name: "bug-reports", type: 0, parent: "SUPPORT" },
];

/**
 * Creates recommended channels on a Discord server (Guild) via Discord Bot REST API.
 * Requires a Discord Bot Token with 'MANAGE_CHANNELS' permission.
 */
export async function createDiscordServerChannels(
  botToken: string,
  guildId: string,
) {
  const baseUrl = `https://discord.com/api/v10/guilds/${guildId}/channels`;
  const created: string[] = [];
  const errors: string[] = [];

  const categoryMap = new Map<string, string>(); // Name -> Category ID

  // First create categories (type 4)
  for (const item of RECOMMENDED_DISCORD_CHANNELS.filter((c) => c.type === 4)) {
    try {
      const res = await fetch(baseUrl, {
        method: "POST",
        headers: {
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: item.name,
          type: 4,
        }),
      });

      if (res.ok) {
        const data = await res.json() as { id: string };
        categoryMap.set(item.name, data.id);
        created.push(`Category: ${item.name}`);
      } else {
        const text = await res.text();
        errors.push(`Failed category ${item.name}: ${text}`);
      }
    } catch (err: unknown) {
      errors.push(`Error category ${item.name}: ${String(err)}`);
    }
  }

  // Next create text channels (type 0) under their parent category
  for (const item of RECOMMENDED_DISCORD_CHANNELS.filter((c) => c.type === 0)) {
    const parentId = item.parent ? categoryMap.get(item.parent) : undefined;
    try {
      const res = await fetch(baseUrl, {
        method: "POST",
        headers: {
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: item.name,
          type: 0,
          parent_id: parentId,
        }),
      });

      if (res.ok) {
        created.push(`Channel: #${item.name}`);
      } else {
        const text = await res.text();
        errors.push(`Failed channel #${item.name}: ${text}`);
      }
    } catch (err: unknown) {
      errors.push(`Error channel #${item.name}: ${String(err)}`);
    }
  }

  return { created, errors };
}
