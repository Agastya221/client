import { Client } from "pg";
import { resolveConnectionString } from "@/lib/db";
import type { Query } from "@/lib/auth-adapter";

/**
 * One short-lived Postgres connection per query. A Worker cannot keep a connection open
 * between requests, so there is nothing to pool; connect, run, close. Used by the sign-in
 * adapter (lib/auth-adapter.ts); the rest of the app's database access still goes through
 * Prisma (lib/db.ts).
 */
export const pgQuery: Query = async (text, values = []) => {
  const connectionString = resolveConnectionString();
  if (!connectionString) throw new Error("No PostgreSQL connection string is configured (DATABASE_URL).");
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return (await client.query(text, values)).rows;
  } finally {
    await client.end().catch(() => {});
  }
};
