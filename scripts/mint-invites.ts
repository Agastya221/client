/**
 * Prints invite codes for the closed community. Codes are derived from the site secret, so
 * nothing is stored anywhere: run it again any time and you get the same codes.
 *
 *   npm run invites                 -> members 1-50
 *   npm run invites -- 51 100       -> members 51-100 (raise the open spots to 100 first)
 *   npm run invites -- friends      -> the shared friends code, version 1. After "Make a new
 *   npm run invites -- friends 3       code" in the admin panel, pass the version (or just
 *                                      copy it from the panel, which always shows the current one)
 *
 * The secret must be the same SITE_ACCESS_SECRET (or AUTH_SECRET) the deployed site uses.
 */
import { getAccessConfig, makeInviteCode, makeSharedCode, MAX_MEMBERS_LIMIT } from "../lib/access/invite";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main() {
  const { secret } = getAccessConfig({ ...process.env, SITE_ACCESS: "on" });
  if (!secret) fail("Set SITE_ACCESS_SECRET (or AUTH_SECRET) first: codes are signed with it.");

  if (process.argv[2] === "friends") {
    const version = Number.parseInt(process.argv[3] ?? "1", 10);
    if (!Number.isInteger(version) || version < 1) fail("Usage: npm run invites -- friends [version]");
    console.log(await makeSharedCode(secret, version));
    return;
  }

  const from = Number.parseInt(process.argv[2] ?? "1", 10);
  const to = Number.parseInt(process.argv[3] ?? String(from === 1 ? 50 : from), 10);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from || to > MAX_MEMBERS_LIMIT) {
    fail("Usage: npm run invites -- [first] [last]   or   npm run invites -- friends [version]");
  }
  for (let member = from; member <= to; member++) {
    console.log(await makeInviteCode(secret, member));
  }
}

void main();
