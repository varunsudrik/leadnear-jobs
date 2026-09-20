"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const POLL_INTERVAL_MS = 30_000;
const ANIMATION_DURATION_MS = 1_500;

function formatCount(value) {
  return Number(value || 0).toLocaleString();
}

export default function LiveJobCount({ initialCount, onSnapshot, pollOnly = false }) {
  const [displayedCount, setDisplayedCount] = useState(initialCount);
  const displayedCountRef = useRef(initialCount);
  const animationFrameRef = useRef(null);
  const reducedMotionRef = useRef(false);
  // Kept in a ref (not the effect's dependency array) so an inline/unmemoized
  // onSnapshot from the caller doesn't restart the poll interval every render.
  const onSnapshotRef = useRef(onSnapshot);
  useEffect(() => {
    onSnapshotRef.current = onSnapshot;
  }, [onSnapshot]);
  // Same reasoning: pollOnly can flip (e.g. a filter is applied without this
  // component remounting) without needing to tear down and restart the poll.
  const pollOnlyRef = useRef(pollOnly);
  useEffect(() => {
    pollOnlyRef.current = pollOnly;
  }, [pollOnly]);

  const stopAnimation = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const setCountImmediately = useCallback((count) => {
    displayedCountRef.current = count;
    setDisplayedCount(count);
  }, []);

  const animateTo = useCallback((nextCount) => {
    const startCount = displayedCountRef.current;

    if (nextCount <= startCount || reducedMotionRef.current) {
      stopAnimation();
      setCountImmediately(nextCount);
      return;
    }

    stopAnimation();
    const startedAt = performance.now();

    const tick = (now) => {
      const progress = Math.min((now - startedAt) / ANIMATION_DURATION_MS, 1);
      const easedProgress = 1 - (1 - progress) ** 3;
      const count = Math.round(startCount + (nextCount - startCount) * easedProgress);

      setCountImmediately(count);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(tick);
      } else {
        animationFrameRef.current = null;
      }
    };

    animationFrameRef.current = requestAnimationFrame(tick);
  }, [setCountImmediately, stopAnimation]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => {
      reducedMotionRef.current = mediaQuery.matches;
    };

    updateMotionPreference();
    mediaQuery.addEventListener("change", updateMotionPreference);

    return () => {
      mediaQuery.removeEventListener("change", updateMotionPreference);
      stopAnimation();
    };
  }, [stopAnimation]);

  useEffect(() => {
    let cancelled = false;

    const refreshCount = async () => {
      if (document.visibilityState !== "visible") return;

      try {
        const response = await fetch("/jobs/api/live-count", { cache: "no-store" });
        if (!response.ok) return;

        const body = await response.json();
        if (cancelled) return;

        const nextCount = Number(body.totalJobs);
        // pollOnly callers scope a filtered/route-specific result set that
        // /api/live-count (unfiltered site_metrics.total_jobs) can't answer,
        // so we still fetch/poll for onSnapshot's updatedAt but never animate
        // the display toward the sitewide number.
        if (!pollOnlyRef.current && Number.isFinite(nextCount)) animateTo(nextCount);
        onSnapshotRef.current?.(body);
      } catch {
        // Keep the last known value until the next scheduled refresh succeeds.
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshCount();
    };

    refreshCount();
    const interval = window.setInterval(refreshCount, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [animateTo]);

  // pollOnly renders the caller-supplied (SSR-correct) initialCount directly
  // rather than the animated/polled value, and reads it straight from the
  // prop so it stays correct even if this instance persists (unremounted)
  // across a navigation that changes initialCount without pollOnly changing.
  return (
    <strong className="live-job-count">
      {pollOnly ? formatCount(initialCount) : formatCount(displayedCount)}
    </strong>
  );
}
