"use client";

import { useEffect, useState } from "react";

const QUERY = "(min-width: 820px)";

/**
 * SSR-safe breakpoint hook. Defaults to `false` (mobile) on the server and
 * during the first client render, then syncs to the real viewport.
 *
 * Note: crossing this breakpoint swaps RoomShell's entire tree, which
 * remounts everything below it — including SpatialMap. Components that hold
 * gesture state across a drag (see SpatialMap's drag-cleanup effect) must
 * account for being unmounted mid-gesture.
 */
export const useIsDesktop = (): boolean => {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    setIsDesktop(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isDesktop;
};
