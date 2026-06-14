"use client";

import { useRef, useEffect, useState } from "react";

/**
 * Scroll-synced video backdrop (the "down the rabbit hole" effect).
 *
 * Picks a random webm from public/alice/ on each load, then maps scroll
 * position (0 → scrollRange px) to video time, so frames advance as you scroll
 * and fade out past `fadeOutStart`. `mix-blend-mode: screen` over the near-black
 * page makes bright-on-dark footage glow without ever overpowering the content;
 * `filter` warms it toward RVBBIT's amber/ink palette and the bottom mask keeps
 * it from fighting text lower on the page.
 *
 * To tune: drop more webms in public/alice/ (GOP=1 / low keyframe interval for
 * smooth seeking), and adjust maxOpacity / tint below.
 */
export function ScrollVideo({
  scrollRange = 3200,
  maxOpacity = 0.13,
  fadeOutStart = 1700,
  tint = "saturate(0.5) sepia(0.18) hue-rotate(-6deg) contrast(1.05)",
}: {
  scrollRange?: number;
  maxOpacity?: number;
  fadeOutStart?: number;
  tint?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [src, setSrc] = useState<string | null>(null);

  // Always start the journey at the top, regardless of scroll restoration.
  useEffect(() => {
    if ("scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }
    window.scrollTo(0, 0);
  }, []);

  // Respect reduced-motion: skip the effect entirely.
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setEnabled(!mq.matches);
  }, []);

  // Pick a random video from the manifest on mount.
  useEffect(() => {
    if (!enabled) return;
    fetch("/api/alice")
      .then((r) => (r.ok ? r.json() : { files: [] }))
      .then(({ files }: { files: string[] }) => {
        if (files.length > 0) {
          const pick = files[Math.floor(Math.random() * files.length)];
          setSrc(`/alice/${pick}`);
        }
      })
      .catch(() => {});
  }, [enabled]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    let ticking = false;

    const update = () => {
      ticking = false;
      const scrollY = window.scrollY;
      const progress = Math.min(scrollY / scrollRange, 1);

      if (video.duration && !isNaN(video.duration)) {
        video.currentTime = progress * video.duration;
      }

      const fadeLength = 700;
      let opacity = maxOpacity;
      if (scrollY > fadeOutStart) {
        opacity =
          maxOpacity * Math.max(0, 1 - (scrollY - fadeOutStart) / fadeLength);
      }
      video.style.opacity = String(opacity);
    };

    const handleScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };

    const onReady = () => {
      setReady(true);
      update();
      window.addEventListener("scroll", handleScroll, { passive: true });
    };

    if (video.readyState >= 1) {
      onReady();
    } else {
      video.addEventListener("loadedmetadata", onReady, { once: true });
    }

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [src, scrollRange, maxOpacity, fadeOutStart]);

  if (!enabled || !src) return null;

  return (
    <video
      ref={videoRef}
      src={src}
      muted
      playsInline
      preload="auto"
      aria-hidden="true"
      className="scroll-video"
      style={{
        opacity: ready ? maxOpacity : 0,
        transition: "opacity 0.6s ease",
        mixBlendMode: "screen",
        filter: tint,
        WebkitMaskImage:
          "linear-gradient(to bottom, black 55%, transparent 100%)",
        maskImage: "linear-gradient(to bottom, black 55%, transparent 100%)",
      }}
      onError={(e) => {
        (e.target as HTMLVideoElement).style.display = "none";
      }}
    />
  );
}
