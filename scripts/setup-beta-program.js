try { process.loadEnvFile('.env'); } catch (e) {}

const botToken = process.argv[2] || process.env.DISCORD_BOT_TOKEN;
const guildId = process.argv[3] || process.env.DISCORD_GUILD_ID;

if (!botToken || !guildId) {
  console.log("❌ Missing DISCORD_BOT_TOKEN or DISCORD_GUILD_ID");
  process.exit(1);
}

const BETA_CHANNELS = [
  { name: "🧪 BETA TESTING", type: 4 }, // Category
  { name: "apply-for-beta", type: 0, parent: "🧪 BETA TESTING" },
  { name: "beta-announcements", type: 0, parent: "🧪 BETA TESTING" },
  { name: "beta-lounge", type: 0, parent: "🧪 BETA TESTING" },
  { name: "beta-bugs-and-feedback", type: 0, parent: "🧪 BETA TESTING" },
];

async function setupBeta() {
  console.log("🚀 Setting up Beta Testing Program on Discord...");

  let categoryId = null;

  // Create Category
  const catRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: "🧪 BETA TESTING", type: 4 }),
  });

  if (catRes.ok) {
    const data = await catRes.json();
    categoryId = data.id;
    console.log(`  ✅ Created Category: 🧪 BETA TESTING (${categoryId})`);
  }

  let applyChannelId = null;

  // Create Channels under Beta Category
  for (const ch of BETA_CHANNELS.filter(c => c.type === 0)) {
    const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: ch.name,
        type: 0,
        parent_id: categoryId || undefined,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      console.log(`  ✅ Created Channel: #${ch.name}`);
      if (ch.name === "apply-for-beta") {
        applyChannelId = data.id;
      }
    } else {
      console.error(`  ❌ Failed #${ch.name}:`, await res.text());
    }
  }

  // Post formatted Beta Announcement in #apply-for-beta
  if (applyChannelId) {
    console.log("📢 Posting Beta Announcement Embed in #apply-for-beta...");
    const embed = {
      title: "🔥 CLOSED BETA TESTING PROGRAM — 50 SPOTS ONLY!",
      description: `We are preparing for the upcoming release of **Tatakai Anime**! We are opening an exclusive **Closed Beta** to test early features, streaming performance, and user experience.`,
      color: 0x9333ea, // Vibrant Purple
      fields: [
        {
          name: "🎯 Available Spots",
          value: "**50 Testers Only** (First-come, first-served after review)",
          inline: true,
        },
        {
          name: "⏰ Start Date",
          value: "**Starting Soon!**",
          inline: true,
        },
        {
          name: "🎁 Beta Tester Perks",
          value: "• Exclusive **Beta Tester** Discord Role\n• Early Access to site features & streaming\n• Direct line with the dev team for suggestions",
          inline: false,
        },
        {
          name: "📝 How to Apply",
          value: "To apply, please react with 🧪 to this post or reply in this channel with:\n1. Your device (PC / Mobile)\n2. Favorite Anime genre\n3. Why you'd like to test!",
          inline: false,
        },
      ],
      footer: { text: "Tatakai Anime • Closed Beta Program" },
      timestamp: new Date().toISOString(),
    };

    const msgRes = await fetch(`https://discord.com/api/v10/channels/${applyChannelId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        embeds: [embed],
      }),
    });

    if (msgRes.ok) {
      console.log("  ✅ Announcement posted successfully!");
    } else {
      console.error("  ❌ Failed to post announcement:", await msgRes.text());
    }
  }

  console.log("\n🎉 Beta Testing Program setup complete!");
}

setupBeta().catch(console.error);
