import type { ProviderAttemptStatus, ProviderId } from "@/lib/anime/types";
import { humanizeProviderId } from "@/lib/anime/utils";
import ProviderBadge from "./ProviderBadge";

interface AttemptTrailProps {
  attempts: ProviderAttemptStatus[];
  activeProvider?: ProviderId;
  label?: string;
}

const STATE_CLASSES: Record<ProviderAttemptStatus["state"], string> = {
  success: "border-[#69f48d]/30 bg-[#69f48d]/10 text-[#8dffab]",
  error: "border-[#ff8a8a]/30 bg-[#ff8a8a]/10 text-[#ffb4ab]",
  empty: "border-[#ffb347]/30 bg-[#ffb347]/10 text-[#ffd79c]",
  skipped: "border-outline-variant/30 bg-surface-container text-on-surface-variant",
};

export default function AttemptTrail({
  attempts,
  activeProvider,
  label = "Provider trail",
}: AttemptTrailProps) {
  if (attempts.length === 0) return null;

  return (
    <div className="space-y-3 rounded-2xl border border-outline-variant/20 bg-surface-container-low p-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-on-surface-variant">{label}</p>
        {activeProvider ? <ProviderBadge provider={activeProvider} active /> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {attempts.map((attempt) => (
          <div
            key={`${attempt.provider}-${attempt.state}-${attempt.message}`}
            className={`rounded-full border px-3 py-1.5 text-[11px] ${STATE_CLASSES[attempt.state]}`}
            title={attempt.message}
          >
            <span className="font-bold uppercase tracking-[0.18em]">{humanizeProviderId(attempt.provider)}</span>
            <span className="ml-2 text-[10px] uppercase tracking-[0.12em]">{attempt.state}</span>
          </div>
        ))}
      </div>
      <div className="space-y-1">
        {attempts.map((attempt) => (
          <p
            key={`${attempt.provider}-${attempt.message}`}
            className="text-xs leading-relaxed text-on-surface-variant"
          >
            <span className="font-semibold text-on-surface">{humanizeProviderId(attempt.provider)}:</span>{" "}
            {attempt.message}
          </p>
        ))}
      </div>
    </div>
  );
}
