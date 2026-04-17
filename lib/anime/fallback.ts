import { PROVIDERS, type ProviderId, type WatchSessionModel } from "./types";

export interface WatchFallbackTarget {
  provider: ProviderId;
  server?: string;
  reason: string;
}

export function normalizeProviderParam(value: string | null | undefined): ProviderId | null {
  if (!value) return null;
  return PROVIDERS.includes(value as any) ? (value as ProviderId) : null;
}

export function getFallbackWatchTargets(session: WatchSessionModel): WatchFallbackTarget[] {
  const targets: WatchFallbackTarget[] = [];
  const seen = new Set<string>();

  for (const option of session.serverOptions) {
    if (option.provider !== session.provider) continue;
    if (option.id === session.activeServerId) continue;

    const key = `${option.provider}:${option.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({
      provider: option.provider,
      server: option.id,
      reason: `Retry ${option.label}`,
    });
  }

  const providerOrder = PROVIDERS.filter((provider) => session.availableProviders.includes(provider));
  for (const provider of providerOrder) {
    if (provider === session.provider) continue;
    const key = `${provider}:provider`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({
      provider,
      reason: `Switch to ${provider}`,
    });
  }

  return targets;
}
