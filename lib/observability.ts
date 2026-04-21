type MetricValue = string | number | boolean | null | undefined;
type MetricTags = Record<string, MetricValue>;

type CounterMetric = {
  name: string;
  tags: Record<string, string>;
  value: number;
  updatedAt: number;
};

type TimingMetric = {
  name: string;
  tags: Record<string, string>;
  count: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
  lastMs: number;
  updatedAt: number;
};

type RecentEvent = {
  timestamp: string;
  type: "counter" | "timing" | "log";
  name: string;
  value?: number;
  level?: "info" | "warn" | "error";
  tags: Record<string, string>;
  message?: string;
};

const MAX_RECENT_EVENTS = 250;
const counters = new Map<string, CounterMetric>();
const timings = new Map<string, TimingMetric>();
const recentEvents: RecentEvent[] = [];

function nowMs(): number {
  return Date.now();
}

function monotonicNow(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function normalizeTags(tags?: MetricTags): Record<string, string> {
  if (!tags) return {};

  const normalized: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(tags)) {
    if (!key) continue;
    if (rawValue === null || rawValue === undefined) continue;
    const value = String(rawValue).trim();
    if (!value) continue;
    normalized[key] = value.slice(0, 180);
  }
  return normalized;
}

function metricKey(name: string, tags: Record<string, string>): string {
  const sortedEntries = Object.entries(tags).sort(([left], [right]) => left.localeCompare(right));
  return `${name}|${sortedEntries.map(([key, value]) => `${key}=${value}`).join("|")}`;
}

function pushRecentEvent(event: RecentEvent): void {
  recentEvents.push(event);
  if (recentEvents.length > MAX_RECENT_EVENTS) {
    recentEvents.splice(0, recentEvents.length - MAX_RECENT_EVENTS);
  }
}

function maybeLog(level: "info" | "warn" | "error", name: string, tags: Record<string, string>, message?: string): void {
  const payload = {
    at: new Date().toISOString(),
    event: name,
    level,
    ...tags,
    ...(message ? { message } : {}),
  };
  const serialized = JSON.stringify(payload);

  if (level === "error") {
    console.error(serialized);
    return;
  }

  if (level === "warn") {
    console.warn(serialized);
    return;
  }

  console.info(serialized);
}

export function recordCounter(name: string, delta = 1, tags?: MetricTags): void {
  const normalizedTags = normalizeTags(tags);
  const key = metricKey(name, normalizedTags);
  const updatedAt = nowMs();
  const current = counters.get(key);

  if (current) {
    current.value += delta;
    current.updatedAt = updatedAt;
  } else {
    counters.set(key, {
      name,
      tags: normalizedTags,
      value: delta,
      updatedAt,
    });
  }

  pushRecentEvent({
    timestamp: new Date(updatedAt).toISOString(),
    type: "counter",
    name,
    value: delta,
    tags: normalizedTags,
  });
}

export function recordTiming(name: string, durationMs: number, tags?: MetricTags): void {
  const normalizedTags = normalizeTags(tags);
  const key = metricKey(name, normalizedTags);
  const updatedAt = nowMs();
  const safeDuration = Number.isFinite(durationMs) ? Math.max(0, Number(durationMs.toFixed(2))) : 0;
  const current = timings.get(key);

  if (current) {
    current.count += 1;
    current.totalMs += safeDuration;
    current.minMs = Math.min(current.minMs, safeDuration);
    current.maxMs = Math.max(current.maxMs, safeDuration);
    current.lastMs = safeDuration;
    current.updatedAt = updatedAt;
  } else {
    timings.set(key, {
      name,
      tags: normalizedTags,
      count: 1,
      totalMs: safeDuration,
      minMs: safeDuration,
      maxMs: safeDuration,
      lastMs: safeDuration,
      updatedAt,
    });
  }

  pushRecentEvent({
    timestamp: new Date(updatedAt).toISOString(),
    type: "timing",
    name,
    value: safeDuration,
    tags: normalizedTags,
  });
}

export function recordLog(
  level: "info" | "warn" | "error",
  name: string,
  tags?: MetricTags,
  message?: string,
): void {
  const normalizedTags = normalizeTags(tags);
  const timestamp = new Date().toISOString();

  pushRecentEvent({
    timestamp,
    type: "log",
    name,
    level,
    tags: normalizedTags,
    message,
  });

  maybeLog(level, name, normalizedTags, message);
}

export async function measureAsync<T>(
  name: string,
  tags: MetricTags,
  fn: () => Promise<T>,
): Promise<T> {
  const startedAt = monotonicNow();

  try {
    const result = await fn();
    recordTiming(name, monotonicNow() - startedAt, {
      ...tags,
      status: "ok",
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    recordTiming(name, monotonicNow() - startedAt, {
      ...tags,
      status: "error",
    });
    recordCounter(`${name}.error`, 1, tags);
    recordLog("warn", `${name}.failure`, tags, message);
    throw error;
  }
}

export function getObservabilitySnapshot(): {
  counters: Array<CounterMetric & { updatedAtIso: string }>;
  timings: Array<TimingMetric & { avgMs: number; updatedAtIso: string }>;
  recentEvents: RecentEvent[];
} {
  return {
    counters: Array.from(counters.values())
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map((metric) => ({
        ...metric,
        updatedAtIso: new Date(metric.updatedAt).toISOString(),
      })),
    timings: Array.from(timings.values())
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map((metric) => ({
        ...metric,
        avgMs: metric.count > 0 ? Number((metric.totalMs / metric.count).toFixed(2)) : 0,
        updatedAtIso: new Date(metric.updatedAt).toISOString(),
      })),
    recentEvents: recentEvents.slice().reverse(),
  };
}
