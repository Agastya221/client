"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useExitTransition(
  open: boolean,
  onExited: () => void,
  durationMs = 180,
) {
  const [isClosing, setIsClosing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onExitedRef = useRef(onExited);

  useEffect(() => {
    onExitedRef.current = onExited;
  }, [onExited]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const requestClose = useCallback(() => {
    if (!open || isClosing) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onExitedRef.current();
      return;
    }

    setIsClosing(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      onExitedRef.current();
    }, durationMs);
  }, [durationMs, isClosing, open]);

  const prepareOpen = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setIsClosing(false);
  }, []);

  return { isClosing, prepareOpen, requestClose };
}
