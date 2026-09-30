import assert from "node:assert/strict";
import test from "node:test";
import { createPgAdapter, type Query } from "../lib/auth-adapter.ts";

type Call = { text: string; values: unknown[] };

function fake(rows: Record<string, unknown>[][] = []) {
  const calls: Call[] = [];
  const query: Query = async (text, values = []) => { calls.push({ text: text.replace(/\s+/g, " ").trim(), values }); return rows.shift() ?? []; };
  return { calls, adapter: createPgAdapter(query)! };
}
const row = { id: "u1", name: "Agastya", email: null, emailVerified: null, image: "https://img" };

test("a returning AniList user is found through their account, never by email", async () => {
  const { adapter, calls } = fake([[row]]);
  const user = await adapter.getUserByAccount!({ provider: "anilist", providerAccountId: "408491" });
  assert.deepEqual(user, { id: "u1", name: "Agastya", email: null, emailVerified: null, image: "https://img" });
  assert.match(calls[0].text, /FROM "User" u JOIN "Account" a ON a\."userId" = u\.id WHERE a\.provider = \$1 AND a\."providerAccountId" = \$2/);
  assert.deepEqual(calls[0].values, ["anilist", "408491"]);
});

test("no matching account means no user (Auth.js then creates one)", async () => {
  const { adapter } = fake([[]]);
  assert.equal(await adapter.getUserByAccount!({ provider: "anilist", providerAccountId: "1" }), null);
  assert.equal(await fake([[]]).adapter.getUser!("nope"), null);
});

test("a new user is inserted with a fresh id and both timestamps, and null email stays null", async () => {
  const { adapter, calls } = fake([[{ ...row, id: "new" }]]);
  const user = await adapter.createUser!({ id: "ignored", name: "Agastya", email: null as unknown as string, emailVerified: null, image: "https://img" });
  assert.equal(user.id, "new");
  assert.match(calls[0].text, /^INSERT INTO "User" \(id, name, email, "emailVerified", image, "createdAt", "updatedAt"\) VALUES \(\$1, \$2, \$3, \$4, \$5, now\(\), now\(\)\) RETURNING/);
  const [id, name, email, verified, image] = calls[0].values;
  assert.match(String(id), /^[0-9a-f-]{36}$/);
  assert.notEqual(id, "ignored", "the database id is ours, not whatever Auth.js put on the object");
  assert.deepEqual([name, email, verified, image], ["Agastya", null, null, "https://img"]);
});

test("linking an account writes every token column, as an upsert", async () => {
  const { adapter, calls } = fake();
  await adapter.linkAccount!({
    userId: "u1", type: "oauth", provider: "anilist", providerAccountId: "408491",
    access_token: "tok", token_type: "bearer", expires_at: 1790000000, scope: undefined,
  });
  assert.match(calls[0].text, /^INSERT INTO "Account" \(id, "userId", type, provider, "providerAccountId", refresh_token, access_token, expires_at, token_type, scope, id_token, session_state\)/);
  assert.match(calls[0].text, /ON CONFLICT \(provider, "providerAccountId"\) DO UPDATE SET/);
  const v = calls[0].values;
  assert.equal(v.length, 12);
  assert.deepEqual(v.slice(1), ["u1", "oauth", "anilist", "408491", null, "tok", 1790000000, "bearer", null, null, null]);
});

test("updateUser only touches the fields it was given, and bumps updatedAt", async () => {
  const { adapter, calls } = fake([[row]]);
  await adapter.updateUser!({ id: "u1", name: "New Name" });
  assert.match(calls[0].text, /^UPDATE "User" SET "name" = \$2, "updatedAt" = now\(\) WHERE id = \$1 RETURNING/);
  assert.deepEqual(calls[0].values, ["u1", "New Name"]);
});

test("values are always parameters, never pasted into the SQL", async () => {
  const { adapter, calls } = fake([[], [], []]);
  const evil = "x'; DROP TABLE \"User\"; --";
  await adapter.getUser!(evil);
  await adapter.getUserByEmail!(evil.toLowerCase());
  await adapter.getUserByAccount!({ provider: evil, providerAccountId: evil });
  for (const call of calls) assert.ok(!call.text.includes("DROP"), call.text);
});

test("the adapter has no session methods: sign-in uses JWTs, so none are needed", () => {
  const adapter = createPgAdapter(async () => []);
  assert.equal(adapter.createSession, undefined);
  assert.equal(adapter.getSessionAndUser, undefined);
});
