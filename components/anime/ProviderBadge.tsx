import type { ProviderId } from "@/lib/anime/types";
import { humanizeProviderId } from "@/lib/anime/utils";

interface ProviderBadgeProps {
  provider: ProviderId;
  active?: boolean;
  subtle?: boolean;
}

export default function ProviderBadge({ provider, active = false, subtle = false }: ProviderBadgeProps) {
  const activeClasses = active
    ? "border-primary/40 bg-primary/15 text-primary"
    : subtle
      ? "border-outline-variant/30 bg-surface-container text-on-surface-variant"
      : "border-outline-variant/30 bg-surface-container-high text-on-surface";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] ${activeClasses}`}
    >
      {humanizeProviderId(provider)}
    </span>
  );
}
