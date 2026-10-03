"use client";

import { useEffect, useRef, useState } from "react";

type NetworkInformation = {
  saveData?: boolean;
  effectiveType?: string;
};

export function HeroMedia({
  hasVideo,
  hasPoster,
}: {
  hasVideo: boolean;
  hasPoster: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [allowVideo, setAllowVideo] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);

  useEffect(() => {
    if (!hasVideo) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const connection = (navigator as Navigator & { connection?: NetworkInformation })
      .connection;
    const constrained =
      connection?.saveData ||
      connection?.effectiveType === "slow-2g" ||
      connection?.effectiveType === "2g";

    if (reducedMotion || constrained) return;
    const timer = window.setTimeout(() => setAllowVideo(true), 0);
    return () => window.clearTimeout(timer);
  }, [hasVideo]);

  useEffect(() => {
    const root = rootRef.current;
    const video = videoRef.current;
    if (!allowVideo || !root || !video) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          void video.play().catch(() => setVideoFailed(true));
        } else {
          video.pause();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(root);
    return () => {
      observer.disconnect();
      video.pause();
    };
  }, [allowVideo]);

  const showVideo = allowVideo && !videoFailed;

  return (
    <div ref={rootRef} className="absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="hero-static absolute inset-0" />

      {/* Replaceable production asset: /public/videos/scanme-hero.mp4.
          Optional static poster: /public/images/scanme-hero-poster.webp. */}
      {hasVideo && showVideo ? (
        <>
          <video
            ref={videoRef}
            className="absolute inset-0 size-full object-cover"
            muted
            loop
            playsInline
            preload="none"
            poster={hasPoster ? "/images/scanme-hero-poster.webp" : undefined}
            onError={() => setVideoFailed(true)}
          >
            <source src="/videos/scanme-hero.mp4" type="video/mp4" />
          </video>
          <div className="hero-scrim absolute inset-0" />
        </>
      ) : null}
    </div>
  );
}
