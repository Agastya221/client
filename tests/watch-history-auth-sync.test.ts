import assert from "node:assert/strict";
import test from "node:test";

type StoredValues = Map<string, string>;

function installBrowserStubs() {
  const stored: StoredValues = new Map();
  const requests: Array<{ url: string; body: Record<string, unknown> | null }> = [];

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem(key: string) {
        return stored.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        stored.set(key, value);
      },
      removeItem(key: string) {
        stored.delete(key);
      },
    },
  });

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      setTimeout,
      clearTimeout,
      dispatchEvent() {
        return true;
      },
      addEventListener() {},
      removeEventListener() {},
    },
  });

  Object.defineProperty(globalThis, "CustomEvent", {
    configurable: true,
    value: class CustomEvent {
      constructor(public type: string) {}
    },
  });

  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      requests.push({
        url,
        body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
      });

      if (url === "/api/anilist/save-entry") {
        return new Response(JSON.stringify({
          success: true,
          entry: { progress: 2 },
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ imported: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  return requests;
}

test("pending AniList progress resumes when Auth.js resolves as authenticated", async () => {
  const requests = installBrowserStubs();
  const {
    setWatchHistoryAuthentication,
    trackEpisodeWatch,
    updateEpisodeProgress,
  } = await import("../lib/anime/watch-history.ts");

  setWatchHistoryAuthentication(false);
  trackEpisodeWatch("anilist~182205", 2, {
    title: "That Time I Got Reincarnated as a Slime Season 4",
    poster: null,
    href: "/anime/anilist~182205/watch?ep=2",
    provider: "anikoto",
    anilistId: 182205,
  });
  updateEpisodeProgress("anilist~182205", 2, 1, 1_440);

  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(
    requests.some((request) => request.url === "/api/anilist/save-entry"),
    false,
  );

  setWatchHistoryAuthentication(true);
  await new Promise((resolve) => setTimeout(resolve, 20));

  const syncRequest = requests.find((request) => request.url === "/api/anilist/save-entry");
  assert.deepEqual(syncRequest?.body, {
    rawMediaId: 182205,
    animeId: "anilist~182205",
    title: "That Time I Got Reincarnated as a Slime Season 4",
    progress: 2,
    status: "CURRENT",
    monotonicProgress: true,
  });
});
