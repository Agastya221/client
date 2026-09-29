"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import WatchIntentLink from "@/components/anime/WatchIntentLink";

type WatchIntentLinkProps = React.ComponentProps<typeof WatchIntentLink>;

interface AiringAwareWatchLinkProps extends Omit<WatchIntentLinkProps, "href" | "episodeNumber"> {
  routeId: string;
  latestEpisode: number;
}

/**
 * "Watch" button for the cached anime detail page. Arriving from the airing schedule
 * (`?from=airing`) should open the latest episode rather than episode 1, but the page is
 * served from a pre-rendered copy and cannot read the URL on the server. The fallback
 * (episode 1) is what the cached HTML contains; the browser upgrades it when needed.
 */
export default function AiringAwareWatchLink({ latestEpisode, ...linkProps }: AiringAwareWatchLinkProps) {
  return (
    <Suspense fallback={<WatchLink {...linkProps} episode={1} />}>
      <AiringAwareInner {...linkProps} latestEpisode={latestEpisode} />
    </Suspense>
  );
}

function AiringAwareInner({ latestEpisode, ...linkProps }: AiringAwareWatchLinkProps) {
  const fromAiring = useSearchParams().get("from") === "airing";
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
