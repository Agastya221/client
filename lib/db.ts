import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for the PostgreSQL Prisma client.");
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
}

/**
 * Lazy Prisma proxy — the actual client is only created the first time a
 * database operation is called, NOT at module-import time.
 *
 * This prevents the "DATABASE_URL is required" error that crashes Next.js
 * static page collection during `next build` when the env var hasn't been
 * injected yet (e.g. Vercel build phase before runtime env vars are applied).
 *
 * Pages that never touch the database (home, search, genres, watch…) import
 * things that ultimately import auth.ts → db.ts, but they never call any
 * Prisma method, so the lazy init never fires and the build succeeds.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    // Initialise (and cache) the real client on first property access
    if (!globalForPrisma.prisma) {
      globalForPrisma.prisma = createPrismaClient();
    }
    const value = (globalForPrisma.prisma as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === "function" ? value.bind(globalForPrisma.prisma) : value;
  },
});
