"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

function loadAndDecodeArtwork(src: string): Promise<void> {
  return new Promise((resolve) => {
    const image = new window.Image();
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    image.decoding = "async";
    image.onload = () => {
      void image.decode().catch(() => undefined).finally(finish);
    };
    image.onerror = finish;
    image.src = src;

    if (image.complete) {
      if (image.naturalWidth > 0) {
        void image.decode().catch(() => undefined).finally(finish);
      } else {
        finish();
      }
    }
  });
}

export default function WatchArtworkReadyGate({
  artworkUrls,
  fallback,
  children,
}: {
  artworkUrls: string[];
  fallback: ReactNode;
  children: ReactNode;
}) {
  const stableArtworkUrls = useMemo(
    () => Array.from(new Set(artworkUrls.filter(Boolean))),
    [artworkUrls],
  );
  const artworkKey = stableArtworkUrls.join("|");
  const [readyKey, setReadyKey] = useState(() => stableArtworkUrls.length === 0 ? artworkKey : null);

  useEffect(() => {
    let cancelled = false;

    if (stableArtworkUrls.length === 0) {
      return () => {
        cancelled = true;
      };
    }

    void Promise.all(stableArtworkUrls.map(loadAndDecodeArtwork)).then(() => {
      if (!cancelled) setReadyKey(artworkKey);
    });

    return () => {
      cancelled = true;
    };
  }, [artworkKey, stableArtworkUrls]);

  return stableArtworkUrls.length === 0 || readyKey === artworkKey
    ? children
    : fallback;
}
