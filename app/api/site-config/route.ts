import { NextResponse } from "next/server";
import { routeEnv } from "@/lib/access/route-env";
import { readSiteSettings, resolveAccessConfig, resolveWatching } from "@/lib/access/settings";

export const dynamic = "force-dynamic";

/** The few public settings the browser needs (the "watching" counter). Cached for 5 minutes. */
export async function GET() {
  const env = routeEnv();
  const watching = resolveWatching(await readSiteSettings(env));
  const { maxMembers } = await resolveAccessConfig(env);
  return NextResponse.json(
    { watching, maxMembers },
    { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" } },
  );
}
