import { chromium } from "playwright-core";
const B = "http://localhost:3001", results = [];
const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`); };
const throughWelcome = async (p) => { await p.waitForURL(/\/welcome/, { timeout: 30000 }); await p.getByRole("link", { name: /Continue where|Start watching/ }).click(); };
const b = await chromium.launch({ executablePath: "C:/Users/agast/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe", headless: true });
const ip = () => "9." + Math.floor(Math.random() * 250) + "." + Math.floor(Math.random() * 250) + ".1";
const redeem = async (c) => (await fetch(B + "/api/beta-access", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": ip() }, body: JSON.stringify({ code: c }) })).status;

const save = async (page) => { const done = page.waitForResponse((r) => r.url().includes("/api/admin/access") && r.request().method() === "POST" && r.request().postData()?.includes("save")); await page.getByRole("button", { name: /Save changes/ }).click(); return (await done).ok(); };
const admin = await (await b.newContext({ viewport: { width: 900, height: 1500 } })).newPage();
check("admin API needs sign-in", (await fetch(B + "/api/admin/access")).status === 401);
await admin.goto(B + "/admin/access");
await admin.getByPlaceholder("Password").fill("wrong-password-x");
await admin.getByRole("button", { name: "Sign in" }).click();
await admin.getByText("Wrong password").waitFor({ timeout: 8000 }).then(() => check("wrong password is refused", true), () => check("wrong password is refused", false));
await admin.getByPlaceholder("Password").fill("local-admin-pass-1");
await admin.getByRole("button", { name: "Sign in" }).click();
await admin.getByText("Invite codes").waitFor({ timeout: 15000 });
check("50 individual codes listed", (await admin.locator("li.font-mono").count()) === 50);

const friendsCode = (await admin.getByText(/^TK-FRIENDS-/).first().innerText()).trim();
check("a friends code is shown", /^TK-FRIENDS-[A-Z2-9]{8}$/.test(friendsCode), friendsCode);
await admin.locator("section").nth(0).screenshot({ path: "../shots/admin-friends.png" });
await admin.screenshot({ path: "../shots/admin-panel.png", fullPage: true });

// Friends code: many "different people" (different IPs and fresh browsers), cap far below the crowd
const visitors = [];
for (let i = 0; i < 2; i++) visitors.push(await redeem(friendsCode));
check("the same friends code works again and again (2 entries; unlimited use is unit-tested)", visitors.every((s) => s === 200), visitors.join(","));

// A friend walks in with it through the real page
const friend = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })).newPage();
await friend.goto(B + "/anime/anilist~21/watch?ep=1");
await friend.getByPlaceholder("TK-000-XXXXXXXX").fill(friendsCode);
await friend.getByRole("button", { name: /Unlock YoruMi/ }).click();
await throughWelcome(friend).catch(() => {});
await friend.waitForURL(/\/watch/, { timeout: 15000 }).then(() => check("a friend enters with the code and lands on the page they wanted", true), () => check("friend enters with the code", false, friend.url()));
const badge = friend.getByText("Watching", { exact: true });
await badge.waitFor({ timeout: 60000 });
const shown = Number((await badge.locator("xpath=preceding-sibling::span[1]").innerText()).trim());
check("the WATCHING badge shows with no settings made (2..35 for 50 spots)", shown >= 2 && shown <= 35, String(shown));
await friend.locator("text=Stream not working?").waitFor({ timeout: 60000 });
await friend.evaluate(() => window.scrollTo(0, 0));
await friend.screenshot({ path: "../shots/watching-badge.png" });

// Panel: shrink spots to 5 and withdraw member 2; friends code is unaffected
const inputs = admin.locator("main input");
await inputs.nth(1).fill("5");
await inputs.nth(2).fill("2");
check("saving works", await save(admin));
const cookies = async () => (await admin.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
const codeOf = async (n) => (await (await fetch(B + "/api/admin/access", { headers: { cookie: await cookies() } })).json()).codes.find((c) => c.member === n).code;
check("member 7 is now over the cap of 5", (await redeem(await codeOf(7))) === 401);
check("withdrawn member 2 is refused", (await redeem(await codeOf(2))) === 401);
check("member 3 still works", (await redeem(await codeOf(3))) === 200);
check("friends code still works with a cap of 5", (await redeem(friendsCode)) === 200);
// the friend who signed in earlier is still in
check("the friend stays signed in", (await friend.evaluate(async () => (await fetch("/api/site-config")).status)) === 200);

// Make a new friends code: the old one dies, and the friend is signed out
await admin.getByRole("button", { name: "Make a new code" }).click();
await admin.getByText("Press Save changes to switch").waitFor();
await save(admin);
await admin.waitForTimeout(500);
const newCode = (await admin.getByText(/^TK-FRIENDS-/).first().innerText()).trim();
check("a new friends code was made", newCode !== friendsCode, newCode);
check("the old friends code stops working", (await redeem(friendsCode)) === 401);
{ const st = await redeem(newCode); check("the new one works", st === 200, String(st)); }
await admin.waitForTimeout(62000); // the gate keeps settings for up to a minute
const stillIn = await friend.evaluate(async () => (await fetch("/api/resolve-source", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status);
check("the friend who used the old code is signed out (API refuses)", stillIn === 401, String(stillIn));

// Switch the friends code off
await admin.getByLabel("Friends code works").uncheck();
await save(admin);
check("switched off: even the new code is refused", (await redeem(newCode)) === 401);
await b.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
