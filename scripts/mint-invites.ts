/**
 * Prints invite codes for the closed community. Codes are derived from the site secret, so
 * nothing is stored anywhere: run it again any time and you get the same codes.
 *
 *   npm run invites                 -> members 1-50
 *   npm run invites -- 51 100       -> members 51-100 (raise SITE_MAX_MEMBERS to 100 first)
 *   npm run invites -- friends      -> the one shared code anyone can use (version 1;
 *                                      the admin panel shows the current one)
 *
 * The secret must be the same SITE_ACCESS_SECRET (or AUTH_SECRET) the deployed site uses.
 */
import { getAccessConfig, makeInviteCode, makeSharedCode } from "../lib/access/invite";

const config = getAccessConfig({ ...process.env, SITE_ACCESS: "on" });
if (!config.secret) {
  console.error("Set SITE_ACCESS_SECRET (or AUTH_SECRET) first: codes are signed with it.");
  process.exit(1);
}

if (process.argv[2] === "friends") {
  void makeSharedCode(config.secret, Number(process.argv[3] ?? 1)).then(console.log);
} else {
const from = Number.parseInt(process.argv[2] ?? "1", 10);
const to = Number.parseInt(process.argv[3] ?? String(from === 1 ? 50 : from), 10);
if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from || to > 10000) {
  console.error("Usage: npm run invites -- [first] [last]");
  process.exit(1);
}

async function main() {
  for (let member = from; member <= to; member++) {
    console.log(await makeInviteCode(config.secret, member));
  }
}

main();
}
