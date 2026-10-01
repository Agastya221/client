import { chromium } from "playwright-core";
const B = "http://localhost:3001", CODE = "TK-007-CDGDAKN8", results = [];
const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`); };
const throughWelcome = async (p) => { await p.waitForURL(/\/welcome/, { timeout: 30000 }); await p.getByRole("link", { name: /Continue where|Start watching/ }).click(); };
const b = await chromium.launch({ executablePath: "C:/Users/agast/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe", headless: true });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
const page = await ctx.newPage();

let r = await fetch(B + "/anime/anilist~21", { redirect: "manual" });
check("no invite: a page redirects to the invite page", r.status === 302 && r.headers.get("location")?.startsWith("/beta-access"), r.status + " " + r.headers.get("location"));
r = await fetch(B + "/api/resolve-source", { method: "POST", redirect: "manual" });
check("no invite: the stream API answers 401", r.status === 401, String(r.status));
r = await fetch(B + "/_next/static/nothing.js", { redirect: "manual" });
check("static files are not redirected", r.status !== 302 && r.status !== 401, String(r.status));

await page.goto(B + "/anime/anilist~21/watch?ep=1");
check("browser lands on the invite page, remembering where it was going", page.url().includes("/beta-access?next="), page.url());
await page.screenshot({ path: "../shots/invite-page.png" });

await page.getByPlaceholder("TK-000-XXXXXXXX").fill("TK-007-AAAAAAAA");
await page.getByRole("button", { name: /Unlock YoruMi/ }).click();
await page.getByText("isn't valid").waitFor({ timeout: 8000 }).then(() => check("a wrong code shows an error and stays put", true), () => check("a wrong code shows an error", false));

await page.getByPlaceholder("TK-000-XXXXXXXX").fill(CODE.toLowerCase());
await page.getByRole("button", { name: /Unlock YoruMi/ }).click();
await throughWelcome(page).catch(() => {});
await page.waitForURL(/\/anime\/anilist~21\/watch/, { timeout: 15000 }).then(() => check("the right code (typed in lowercase) opens the page you wanted", true), () => check("the right code opens the page you wanted", false, page.url()));
await page.locator("text=Stream not working?").waitFor({ timeout: 60000 }).then(() => check("the watch page works normally behind the gate", true), () => check("the watch page works behind the gate", false));

const cookie = (await ctx.cookies()).find((c) => c.name === "tk_access");
check("access cookie is HttpOnly", !!cookie?.httpOnly, cookie ? "expires in " + Math.round((cookie.expires - Date.now() / 1000) / 86400) + " days" : "missing");
const apiOk = await page.evaluate(async () => (await fetch("/api/resolve-source", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ animeId: "anilist~21", episodeNumber: 1, dubbed: false }) })).status);
check("with the cookie the stream API works", apiOk === 200, String(apiOk));

let last = 0; for (let i = 0; i < 12; i++) last = (await fetch(B + "/api/beta-access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: "TK-001-BBBBBBBB" }) })).status;
check("guessing codes is rate limited", last === 429, String(last));
await b.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
