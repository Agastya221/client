import { NextResponse } from "next/server";
import { adminConfigured, isAdmin } from "@/lib/access/admin-auth";
import { getAccessConfig } from "@/lib/access/invite";
import { routeEnv } from "@/lib/access/route-env";
import { pgQuery } from "@/lib/pg-query";

export const dynamic = "force-dynamic";

/**
 * Admin-only: can this deployment reach the database the way sign-in does (plain `pg`)?
 * Returns row counts and timings only, never connection details.
 */
export async function GET(request: Request) {
  const env = routeEnv();
  const secret = getAccessConfig({ ...env, SITE_ACCESS: "on" }).secret;
  if (!adminConfigured(env) || !secret || !(await isAdmin(env, request, secret))) {
    return NextResponse.json({ error: "Sign in to the admin panel first." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const started = Date.now();
  try {
    const [{ users }] = await pgQuery(`SELECT count(*)::int AS users FROM "User"`);
    const [{ accounts }] = await pgQuery(`SELECT count(*)::int AS accounts FROM "Account"`);
    return NextResponse.json({ ok: true, users, accounts, ms: Date.now() - started }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { ok: false, ms: Date.now() - started, error: message.replace(/postgres(ql)?:\/\/\S+/g, "<connection string>").slice(0, 300) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
