"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const POLL_INTERVAL_MS = 30_000;
const ANIMATION_DURATION_MS = 1_500;

function formatCount(value) {
  return Number(value || 0).toLocaleString();
}

export default function LiveJobCount({ initialCount }) {
  const [displayedCount, setDisplayedCount] = useState(initialCount);
  const displayedCountRef = useRef(initialCount);
  const animationFrameRef = useRef(null);
  const reducedMotionRef = useRef(false);

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
        const nextCount = Number(body.totalJobs);
        if (!cancelled && Number.isFinite(nextCount)) animateTo(nextCount);
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

  return <strong className="live-job-count">{formatCount(displayedCount)}</strong>;
}
