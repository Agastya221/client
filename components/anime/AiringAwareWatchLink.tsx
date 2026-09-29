"use client";

import { useSearchParams } from "next/navigation";
import WatchIntentLink from "@/components/anime/WatchIntentLink";
import { useHydrated } from "@/lib/use-hydrated";

type WatchIntentLinkProps = React.ComponentProps<typeof WatchIntentLink>;

interface AiringAwareWatchLinkProps extends Omit<WatchIntentLinkProps, "href" | "episodeNumber"> {
  routeId: string;
  latestEpisode: number;
}

/**
 * "Watch" button for the cached anime detail page. Arriving from the airing schedule
 * (`?from=airing`) should open the latest episode rather than episode 1, but the page is
 * served from a pre-rendered copy that cannot read the URL. The cached HTML links to
 * episode 1; the browser upgrades the link once the page has hydrated.
 */
export default function AiringAwareWatchLink({ latestEpisode, ...linkProps }: AiringAwareWatchLinkProps) {
  const searchParams = useSearchParams();
  const fromAiring = useHydrated() && searchParams.get("from") === "airing";
  return <WatchLink {...linkProps} episode={fromAiring ? latestEpisode : 1} />;
}

function WatchLink({
  routeId,
  episode,
  ...rest
}: Omit<AiringAwareWatchLinkProps, "latestEpisode"> & { episode: number }) {
  return (
    <WatchIntentLink
      {...rest}
      href={`/anime/${routeId}/watch?ep=${episode}`}
      episodeNumber={episode}
    />
  );
}
