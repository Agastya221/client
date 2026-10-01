import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getCloudflareContext } from "@opennextjs/cloudflare";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

/**
 * Environment variables consulted for the Postgres connection string, in
 * priority order.
 *
 * `POSTGRES_CONNECTION_STRING_VAR` lets an operator point the client at a
 * differently-named variable without a code change. Everything else is a
 * fixed fallback chain.
 *
 * CLOUDFLARE WORKERS / HYPERDRIVE
 * ------------------------------
 * Workers cannot hold a long-lived TCP pool, so raw `pg` against Neon opens a
 * fresh connection per isolate — slow and it burns Neon connection slots.
 * Hyperdrive (free on both Workers plans) fixes this by pooling in front of
 * Postgres and exposing an ordinary Postgres connection string.
 *
 * To switch to Hyperdrive, NO CODE CHANGE IS NEEDED:
 *   1. Uncomment the `hyperdrive` binding in wrangler.jsonc.
 *   2. Set HYPERDRIVE_DATABASE_URL to the binding's connectionString, e.g.
 *      in a route or in the Worker env. Because `nodejs_compat` populates
 *      process.env from bindings and vars, reading it here just works.
 * DATABASE_URL stays as-is for local dev, `next build` and any non-Workers
 * host, and is still the fallback if HYPERDRIVE_DATABASE_URL is unset.
 */
const CONNECTION_STRING_ENV_VARS = [
  "HYPERDRIVE_DATABASE_URL",
  "POSTGRES_URL",
  "DATABASE_URL",
] as const;

export function resolveConnectionString(): string | null {
  // Indirection hook: POSTGRES_CONNECTION_STRING_VAR=MY_VAR makes the client
  // read MY_VAR. Useful when a platform injects a name we do not control.
  const overrideVarName = process.env.POSTGRES_CONNECTION_STRING_VAR?.trim();
  const candidates = overrideVarName
    ? [overrideVarName, ...CONNECTION_STRING_ENV_VARS]
    : [...CONNECTION_STRING_ENV_VARS];

  for (const name of candidates) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return null;
}

function createPrismaClient() {
  const connectionString = resolveConnectionString();
  if (!connectionString) {
    throw new Error(
      `A PostgreSQL connection string is required. Set one of: ${CONNECTION_STRING_ENV_VARS.join(
        ", "
      )} (or point POSTGRES_CONNECTION_STRING_VAR at your own variable name).`
    );
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
}

/**
 * Returns the Workers ExecutionContext of the request being handled, or null outside
 * Workers (next dev, tests, scripts). Read lazily: the adapter only sets it per request.
 */
function currentRequestContext(): object | null {
  try {
    const ctx = getCloudflareContext().ctx as unknown;
    return ctx && typeof ctx === "object" ? ctx : null;
  } catch {
    return null;
  }
}

/**
 * One client per request on Workers. A Worker may not reuse a socket opened while
 * handling a different request ("Cannot perform I/O on behalf of a different request"),
 * so a single global client breaks the second request an isolate serves. Keyed by the
 * request's ExecutionContext in a WeakMap, so it is dropped with the request.
 * Outside Workers a single process-wide client is kept, as before.
 */
const clientsByRequest = new WeakMap<object, PrismaClient>();

export function getPrisma(): PrismaClient {
  const ctx = currentRequestContext();
  if (ctx) {
    let client = clientsByRequest.get(ctx);
    if (!client) {
      client = createPrismaClient();
      clientsByRequest.set(ctx, client);
    }
    return client;
  }
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

/**
 * Lazy Prisma proxy: the real client is only created the first time a database
 * operation is called, NOT at module-import time, so `next build` works without
 * DATABASE_URL. Every property access resolves the client for the current request
 * (see getPrisma), so existing `prisma.x.y()` call sites need no change.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrisma();
    const value = (client as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === "function" ? value.bind(client) : value;
  },
});
