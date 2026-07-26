try { process.loadEnvFile('.env'); } catch (e) {}

const botToken = process.argv[2] || process.env.DISCORD_BOT_TOKEN;
const guildId = process.argv[3] || process.env.DISCORD_GUILD_ID;


if (!botToken || !guildId) {
  console.log(`
❌ Missing required arguments.

Usage:
  node scripts/setup-discord-channels.js <BOT_TOKEN> <SERVER_ID>

How to get arguments:
1. BOT_TOKEN: Create a Bot in https://discord.com/developers/applications -> Bot -> Reset Token.
2. SERVER_ID: Enable Developer Mode in Discord settings -> Right-click your server icon -> Copy Server ID.
3. Make sure to invite your Bot to your server with 'Manage Channels' permission!
  `);
  process.exit(1);
}

const CHANNELS = [
  { name: "📢 INFORMATION", type: 4 },
  { name: "announcements", type: 0, parent: "📢 INFORMATION" },
  { name: "rules", type: 0, parent: "📢 INFORMATION" },
  { name: "release-feed", type: 0, parent: "📢 INFORMATION" },
  
  { name: "💬 COMMUNITY", type: 4 },
  { name: "general-chat", type: 0, parent: "💬 COMMUNITY" },
  { name: "anime-discussion", type: 0, parent: "💬 COMMUNITY" },
  { name: "spoiler-zone", type: 0, parent: "💬 COMMUNITY" },

  { name: "🛠️ SUPPORT", type: 4 },
  { name: "site-feedback", type: 0, parent: "🛠️ SUPPORT" },
  { name: "bug-reports", type: 0, parent: "🛠️ SUPPORT" },
];

async function setup() {
  console.log(`🚀 Connecting to Discord Server ID: ${guildId}...`);

  const categoryMap = new Map();

  // Create Categories first
  for (const item of CHANNELS.filter(c => c.type === 4)) {
    console.log(`Creating Category: ${item.name}...`);
    const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: item.name, type: 4 }),
    });

    if (res.ok) {
      const data = await res.json();
      categoryMap.set(item.name, data.id);
      console.log(`  ✅ Category Created: ${item.name} (${data.id})`);
    } else {
      const err = await res.text();
      console.error(`  ❌ Failed to create ${item.name}:`, err);
    }
  }

  // Create Text Channels under parent category
  for (const item of CHANNELS.filter(c => c.type === 0)) {
    const parentId = item.parent ? categoryMap.get(item.parent) : undefined;
    console.log(`Creating Channel: #${item.name}...`);
    const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
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
      console.log(`  ✅ Channel Created: #${item.name}`);
    } else {
      const err = await res.text();
      console.error(`  ❌ Failed to create #${item.name}:`, err);
    }
  }

  console.log("\n🎉 All channels created successfully!");
}

setup().catch(console.error);
