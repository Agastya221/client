import type { ServerHealthResult, ServerOption } from "./types";

function providerRank(option: ServerOption): number {
  const provider = option.id.match(/^anivexa2-([a-z0-9]+)-/)?.[1];
  if (option.category === "dub") {
    return { aniwaves: 0, anikoto: 1, animegg: 2 }[provider || ""] ?? 3;
  }
  if (option.subType === "soft") return provider === "anikoto" ? 0 : 1;
  if (option.subType === "hard") {
    return { aniwaves: 0, animegg: 1, anineko: 2 }[provider || ""] ?? 3;
  }
  return 3;
}

function rank(option: ServerOption, health?: ServerHealthResult): number {
  const healthRank = health?.status === "working" ? 0 : health?.status === "failed" ? 100 : 20;
  const transportRank = { hls: 0, dash: 1, mp4: 2, embed: 12 }[option.transport || "embed"];
  return healthRank + transportRank + providerRank(option);
}

export function rankServerOptions(
  options: ServerOption[],
  healthById: Record<string, ServerHealthResult>,
): ServerOption[] {
  return options.slice().sort((left, right) =>
    rank(left, healthById[left.id]) - rank(right, healthById[right.id]));
}

export function bestVerifiedServer(
  options: ServerOption[],
  healthById: Record<string, ServerHealthResult>,
): ServerOption | null {
  return rankServerOptions(options.filter((option) =>
    (option.transport === "hls" || option.transport === "mp4" || option.transport === "dash") &&
    healthById[option.id]?.status === "working"), healthById)[0] || null;
}

function solarisVariantRank(option: ServerOption): number {
  if (/vidstream-2/i.test(option.label)) return 0;
  if (/vidstream-1/i.test(option.label)) return 1;
  if (/hd-1/i.test(option.label)) return 2;
  return 3;
}

export function focusedServerCandidates(options: ServerOption[]): ServerOption[] {
  const internal = options.filter((option) => option.transport === "hls");
  const waves = internal.filter((option) => option.id.startsWith("anivexa2-aniwaves-hls-"));
  const solaris = internal.filter((option) => option.id.startsWith("anivexa2-anikoto-hls-"))
    .sort((left, right) => solarisVariantRank(left) - solarisVariantRank(right));
  const hard = waves.filter((option) => option.category === "sub" && option.subType === "hard");
  const soft = solaris.filter((option) => option.category === "sub" && option.subType === "soft");
  const waveDub = waves.filter((option) => option.category === "dub").slice(0, 2);
  const solarisDub = solaris.filter((option) => option.category === "dub")
    .slice(0, 4 - waveDub.length);
  return [...hard.slice(0, 4), ...soft.slice(0, 4), ...waveDub, ...solarisDub];
}

/**
 * A server that failed its health check is hidden outright rather than greyed
 * out - a dead pill is noise, not a choice.
 *
 * `keepId` is the one exception: the server the viewer is currently on stays
 * in the picker even after a failed probe. A probe is not playback, and a
 * manually chosen source has to remain visible and selected so it can still be
 * tested with Play. Callers looking for a *replacement* pass no `keepId`, so
 * the fallback search never proposes a known-failed server.
 */
export function selectFocusedServers(
  options: ServerOption[],
  healthById: Record<string, ServerHealthResult>,
  keep?: { keepId?: string | null },
): { hard: ServerOption[]; soft: ServerOption[]; dub: ServerOption[] } {
  const keepId = keep?.keepId || null;
  const available = focusedServerCandidates(options).filter((option) =>
    option.id === keepId || healthById[option.id]?.status !== "failed");
  return {
    hard: available.filter((option) => option.category === "sub" && option.subType === "hard"),
    soft: available.filter((option) => option.category === "sub" && option.subType === "soft"),
    dub: available.filter((option) => option.category === "dub"),
  };
}
