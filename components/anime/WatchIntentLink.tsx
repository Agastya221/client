"use client";

import { prefetchClientStream } from "@/lib/anime/client-stream-resolver";
import type { ProviderId } from "@/lib/anime/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, type CSSProperties, type ReactNode } from "react";

interface WatchIntentLinkProps {
  href: string;
  animeId: string;
  episodeNumber: number;
  provider?: ProviderId;
  dubbed?: boolean;
  server?: string | null;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

export default function WatchIntentLink({
  href,
  animeId,
  episodeNumber,
  provider = "anikoto",
  dubbed = false,
  server = null,
  className,
  style,
  children,
}: WatchIntentLinkProps) {
  const router = useRouter();
  const warmedKeyRef = useRef<string | null>(null);

  const warm = useCallback(() => {
    const key = [animeId, episodeNumber, provider, dubbed ? "dub" : "sub", server || "auto"].join(":");
    if (warmedKeyRef.current === key) return;
    warmedKeyRef.current = key;

    router.prefetch(href);
    prefetchClientStream(
      { animeId, episodeNumber, provider, dubbed, server },
      { warmFirstSegment: true },
    );
  }, [animeId, dubbed, episodeNumber, href, provider, router, server]);

  return (
    <Link
      href={href}
      prefetch={false}
      className={className}
      style={style}
      onPointerEnter={warm}
      onPointerDown={warm}
      onFocus={warm}
      onTouchStart={warm}
    >
      {children}
    </Link>
  );
}
