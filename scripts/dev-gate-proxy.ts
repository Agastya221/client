/**
 * Local stand-in for the Cloudflare worker's invite gate, for trying the flow on your laptop
 * or phone. Production applies the same lib/access/gate.ts inside worker.ts.
 *
 *   next start -p 3000            (with SITE_ACCESS, SITE_ACCESS_SECRET set)
 *   npm run gate:dev              -> open http://localhost:3001 (or your LAN address)
 */
import http from "node:http";
import { Readable } from "node:stream";
import { applyAccessGate } from "../lib/access/gate";

const PORT = Number(process.env.GATE_PORT ?? 3001);
const TARGET = process.env.GATE_TARGET ?? "http://localhost:3000";

http
  .createServer(async (incoming, outgoing) => {
    const url = new URL(incoming.url ?? "/", `http://${incoming.headers.host ?? "localhost"}`);
    const headers = new Headers();
    for (const [key, value] of Object.entries(incoming.headers)) {
      if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    }
    const hasBody = incoming.method !== "GET" && incoming.method !== "HEAD";
    const request = new Request(url, {
      method: incoming.method,
      headers,
      body: hasBody ? (Readable.toWeb(incoming) as unknown as BodyInit) : undefined,
      duplex: "half",
    } as RequestInit);

    try {
      const blocked = await applyAccessGate(request, process.env);
      const response = blocked ?? (await fetch(new Request(`${TARGET}${url.pathname}${url.search}`, request), { redirect: "manual" }));
      const out: Record<string, string | string[]> = {};
      response.headers.forEach((value, key) => { if (key !== "set-cookie") out[key] = value; });
      const cookies = response.headers.getSetCookie?.() ?? [];
      if (cookies.length) out["set-cookie"] = cookies;
      delete out["content-encoding"];
      delete out["content-length"];
      outgoing.writeHead(response.status, out);
      if (response.body) Readable.fromWeb(response.body as never).pipe(outgoing);
      else outgoing.end();
    } catch (error) {
      outgoing.writeHead(502).end(`gate proxy: ${String(error)}`);
    }
  })
  .listen(PORT, "0.0.0.0", () => console.log(`gate proxy on :${PORT} -> ${TARGET}`));
