/**
 * Runs the sign-in adapter's real SQL against the configured database inside a transaction
 * that is ALWAYS rolled back, so nothing is written. Prints counts only.
 *   node --env-file=.env.local --import tsx scripts/check-auth-adapter.ts
 */
import { Client } from "pg";
import { createPgAdapter, type Query } from "../lib/auth-adapter";
import { resolveConnectionString } from "../lib/db";

async function main() {
  const url = resolveConnectionString();
  if (!url) throw new Error("No database URL in the environment.");
  const client = new Client({ connectionString: url });
  await client.connect();
  const query: Query = async (text, values = []) => (await client.query(text, values)).rows;
  const adapter = createPgAdapter(query);
  const steps: string[] = [];
  const ok = (name: string, pass: boolean) => { steps.push(`${pass ? "PASS" : "FAIL"}  ${name}`); if (!pass) process.exitCode = 1; };

  try {
    // Read-only compatibility: users and accounts created earlier by Prisma are found.
    const [{ users }] = await query(`SELECT count(*)::int AS users FROM "User"`);
    const [{ accounts }] = await query(`SELECT count(*)::int AS accounts FROM "Account" WHERE provider = 'anilist'`);
    steps.push(`INFO  existing rows: ${users} users, ${accounts} AniList accounts`);
    const [existing] = await query(`SELECT "providerAccountId", "userId" FROM "Account" WHERE provider = 'anilist' LIMIT 1`);
    if (existing) {
      const found = await adapter.getUserByAccount!({ provider: "anilist", providerAccountId: String(existing.providerAccountId) });
      ok("an existing Prisma-created AniList user is found by the adapter", found?.id === existing.userId);
    }

    await client.query("BEGIN");
    const marker = `rollback-test-${Date.now()}`;
    const created = await adapter.createUser!({ id: "x", name: "Adapter Check", email: null as unknown as string, emailVerified: null, image: null });
    ok("createUser inserts a row and returns it", Boolean(created.id) && created.name === "Adapter Check");
    await adapter.linkAccount!({ userId: created.id, type: "oauth", provider: "anilist", providerAccountId: marker, access_token: "t1", token_type: "bearer", scope: undefined });
    const byAccount = await adapter.getUserByAccount!({ provider: "anilist", providerAccountId: marker });
    ok("the new user is found through the linked account", byAccount?.id === created.id);
    await adapter.linkAccount!({ userId: created.id, type: "oauth", provider: "anilist", providerAccountId: marker, access_token: "t2", token_type: "bearer" });
    const [{ token }] = await query(`SELECT access_token AS token FROM "Account" WHERE "providerAccountId" = $1`, [marker]);
    ok("signing in again updates the stored token instead of failing", token === "t2");
    const updated = await adapter.updateUser!({ id: created.id, name: "Renamed" });
    ok("updateUser changes the name", updated.name === "Renamed");
    const [{ updatedAt, createdAt }] = await query(`SELECT "updatedAt", "createdAt" FROM "User" WHERE id = $1`, [created.id]);
    ok("createdAt and updatedAt are both filled in", Boolean(updatedAt) && Boolean(createdAt));
    await adapter.unlinkAccount!({ provider: "anilist", providerAccountId: marker });
    ok("unlinkAccount removes it", (await adapter.getUserByAccount!({ provider: "anilist", providerAccountId: marker })) === null);
    await adapter.deleteUser!(created.id);
    ok("deleteUser removes the user", (await adapter.getUser!(created.id)) === null);
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    const [{ after }] = await query(`SELECT count(*)::int AS after FROM "User"`).catch(() => [{ after: "?" }]);
    steps.push(`INFO  users after rollback: ${after} (unchanged)`);
    await client.end();
  }
  console.log(steps.join("\n"));
}

main().catch((error) => { console.error("check failed:", error instanceof Error ? error.message.replace(/postgres(ql)?:\/\/\S+/g, "<connection string>") : error); process.exit(1); });
