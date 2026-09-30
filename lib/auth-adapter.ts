/**
 * The sign-in database adapter: the handful of queries Auth.js needs to find or create a
 * user and remember their AniList account. Plain SQL over `pg`, no Prisma.
 *
 * Why not @auth/prisma-adapter: on the Cloudflare Worker, Prisma's query compiler is
 * WebAssembly that it compiles at runtime, and Workers forbid that ("Wasm code generation
 * disallowed by embedder"). Every Prisma call fails there, which made AniList sign-in end at
 * /auth/signin?error=Configuration after AniList had already said yes. Plain `pg` runs on
 * Workers, and this path needs only five simple statements.
 *
 * It talks to the same tables Prisma created ("User", "Account"), so existing users, their
 * bookmarks and their history are found exactly as before. Sessions are JWTs (lib/auth.ts),
 * so there are no session or verification-token methods.
 */
import type { Adapter, AdapterAccount, AdapterUser } from "next-auth/adapters";
import { randomId } from "@/lib/random-id";

export type Query = (text: string, values?: unknown[]) => Promise<Record<string, unknown>[]>;

const USER_COLUMNS = `id, name, email, "emailVerified", image`;

function toUser(row: Record<string, unknown> | undefined): AdapterUser | null {
  if (!row) return null;
  return {
    id: String(row.id),
    name: (row.name as string | null) ?? null,
    // Null for AniList users (it does not share an email); Auth.js types say string.
    email: row.email as string,
    emailVerified: row.emailVerified ? new Date(row.emailVerified as string | Date) : null,
    image: (row.image as string | null) ?? null,
  };
}

export function createPgAdapter(query: Query): Adapter {
  const one = async (text: string, values: unknown[]) => toUser((await query(text, values))[0]);

  return {
    async createUser(user) {
      const row = (
        await query(
          `INSERT INTO "User" (id, name, email, "emailVerified", image, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, now(), now())
           RETURNING ${USER_COLUMNS}`,
          [randomId(), user.name ?? null, user.email ?? null, user.emailVerified ?? null, user.image ?? null],
        )
      )[0];
      return toUser(row)!;
    },

    getUser: (id) => one(`SELECT ${USER_COLUMNS} FROM "User" WHERE id = $1`, [id]),

    getUserByEmail: (email) => one(`SELECT ${USER_COLUMNS} FROM "User" WHERE email = $1`, [email]),

    getUserByAccount: ({ provider, providerAccountId }) =>
      one(
        `SELECT u.id, u.name, u.email, u."emailVerified", u.image
           FROM "User" u JOIN "Account" a ON a."userId" = u.id
          WHERE a.provider = $1 AND a."providerAccountId" = $2`,
        [provider, providerAccountId],
      ),

    async updateUser(user) {
      const fields: [string, unknown][] = [];
      if (user.name !== undefined) fields.push(["name", user.name]);
      if (user.email !== undefined) fields.push(["email", user.email]);
      if (user.emailVerified !== undefined) fields.push(["emailVerified", user.emailVerified]);
      if (user.image !== undefined) fields.push(["image", user.image]);
      const sets = [...fields.map(([column], i) => `"${column}" = $${i + 2}`), `"updatedAt" = now()`];
      const row = (
        await query(`UPDATE "User" SET ${sets.join(", ")} WHERE id = $1 RETURNING ${USER_COLUMNS}`, [
          user.id,
          ...fields.map(([, value]) => value),
        ])
      )[0];
      return toUser(row)!;
    },

    async deleteUser(id) {
      await query(`DELETE FROM "User" WHERE id = $1`, [id]);
    },

    async linkAccount(account: AdapterAccount) {
      // An upsert: signing in again refreshes the stored token instead of hitting the
      // (provider, providerAccountId) unique index.
      await query(
        `INSERT INTO "Account" (id, "userId", type, provider, "providerAccountId", refresh_token, access_token,
                                expires_at, token_type, scope, id_token, session_state)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (provider, "providerAccountId") DO UPDATE SET
           refresh_token = EXCLUDED.refresh_token, access_token = EXCLUDED.access_token,
           expires_at = EXCLUDED.expires_at, token_type = EXCLUDED.token_type, scope = EXCLUDED.scope,
           id_token = EXCLUDED.id_token, session_state = EXCLUDED.session_state`,
        [
          randomId(),
          account.userId,
          account.type,
          account.provider,
          account.providerAccountId,
          account.refresh_token ?? null,
          account.access_token ?? null,
          account.expires_at ?? null,
          account.token_type ?? null,
          account.scope ?? null,
          account.id_token ?? null,
          (account.session_state as string | undefined) ?? null,
        ],
      );
    },

    async unlinkAccount({ provider, providerAccountId }) {
      await query(`DELETE FROM "Account" WHERE provider = $1 AND "providerAccountId" = $2`, [
        provider,
        providerAccountId,
      ]);
    },
  };
}
