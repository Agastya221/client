import { chromium } from "playwright-core";
const B = "http://192.168.1.17:3001", results = [];   // the LAN address, like the phone: plain http
const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`); };
const throughWelcome = async (p) => { await p.waitForURL(/\/welcome/, { timeout: 30000 }); await p.getByRole("link", { name: /Continue where|Start watching/ }).click(); };
const b = await chromium.launch({ executablePath: "C:/Users/agast/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe", headless: true });

// get a code from the panel
const admin = await (await b.newContext({ viewport: { width: 900, height: 1300 } })).newPage();
await admin.goto(B + "/admin/access");
await admin.getByPlaceholder("Password").fill("local-admin-pass-1");
await admin.getByRole("button", { name: "Sign in" }).click();
await admin.getByText("Invite codes").waitFor({ timeout: 15000 });
const code5 = (await admin.locator("li.font-mono span").nth(4).innerText()).trim();

// copy works on plain http (the phone case) and only then shows a tick
await admin.context().grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
await admin.getByRole("button", { name: "Copy code 5", exact: true }).click();
await admin.waitForTimeout(300);
const ticked = await admin.getByRole("button", { name: "Copy code 5", exact: true }).locator("svg.text-green-400").count();
const failedMsg = await admin.getByText("Couldn't copy automatically").count();
check("copy on plain http: tick only when it really copied, otherwise a message", (ticked === 1) !== (failedMsg === 1), `tick=${ticked} msg=${failedMsg}`);

// open-redirect attempt through the invite link
const victim = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })).newPage();
const ATTACK = "/" + String.fromCharCode(92) + "example.com"; // "/\example.com"
await victim.goto(B + "/beta-access?next=" + encodeURIComponent(ATTACK));
await victim.getByPlaceholder("TK-000-XXXXXXXX").fill(code5.toLowerCase().replace(/-/g, " "));
await victim.getByRole("button", { name: /Unlock YoruMi/ }).click();
await victim.waitForLoadState("domcontentloaded");
await victim.waitForTimeout(3000);
check(`a crafted ?next=${ATTACK} link stays on this site`, new URL(victim.url()).host === new URL(B).host, victim.url());
// and prove the attack string really is dangerous without the fix: the browser resolves it off-site
check("(control) the browser itself treats that path as another site", new URL(ATTACK, B).host === "example.com", new URL(ATTACK, B).href);
check("the code typed in lowercase with spaces was accepted", !(await victim.getByText("isn't valid").count()));

// a member opening the invite page goes straight on
await victim.goto(B + "/beta-access?next=%2Fanime%2Fanilist~21%2Fwatch%3Fep%3D1");
await victim.waitForURL(/\/watch/, { timeout: 15000 }).then(() => check("a member who opens the invite page is sent on to where they were going", true), () => check("member skips invite page", false, victim.url()));
const badge = victim.getByText("Watching", { exact: true });
await badge.waitFor({ timeout: 60000 }).then(() => check("watching badge still shows", true), () => check("watching badge still shows", false));

// friends code still works end to end
const friendsCode = (await admin.getByText(/^TK-FRIENDS-/).first().innerText()).trim();
const friend = await (await b.newContext()).newPage();
friend.on("response", (r) => { if (r.url().includes("/api/beta-access")) console.log("   friend POST status", r.status()); });
await friend.goto(B + "/");
await friend.getByPlaceholder("TK-000-XXXXXXXX").fill(friendsCode);
await friend.getByRole("button", { name: /Unlock YoruMi/ }).click();
await throughWelcome(friend).catch(() => {});
await friend.waitForURL(B + "/", { timeout: 15000 }).then(() => check("friends code still lets people in", true), () => check("friends code", false, friend.url()));
await b.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
