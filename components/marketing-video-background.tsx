"use client";

import { useEffect, useRef } from "react";
import type { MarketingTheme } from "@/lib/marketing-services";

type VideoLayer = {
  element: HTMLVideoElement;
  theme: MarketingTheme;
};

const videoSource: Record<MarketingTheme, string> = {
  dark: "/videos/dark-background.webm",
  light: "/videos/light-background.webm",
};

function createVideo(theme: MarketingTheme, active: boolean) {
  const video = document.createElement("video");
  video.src = videoSource[theme];
  video.className = active ? "is-active" : "is-loading";
  video.dataset.active = active ? "true" : "false";
  video.dataset.themeBackground = theme;
  video.autoplay = active;
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.tabIndex = -1;
  return video;
}

export function MarketingVideoBackground({ theme }: { theme: MarketingTheme }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<VideoLayer | null>(null);
  const incomingRef = useRef<VideoLayer | null>(null);
  const requestedThemeRef = useRef(theme);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    requestedThemeRef.current = theme;

    if (!activeRef.current) {
      const element = createVideo(theme, true);
      activeRef.current = { element, theme };
      container.append(element);
      void element.play().catch(() => undefined);
      return;
    }

    if (activeRef.current.theme === theme) {
      incomingRef.current?.element.remove();
      incomingRef.current = null;
      return;
    }

    incomingRef.current?.element.remove();

    const outgoing = activeRef.current;
    const incoming = createVideo(theme, false);
    const capturedTime = outgoing.element.currentTime;
    const layer = { element: incoming, theme };
    let completing = false;
    incomingRef.current = layer;

    const completeSwap = () => {
      if (
        completing ||
        incomingRef.current !== layer ||
        requestedThemeRef.current !== theme
      ) {
        return;
      }

      completing = true;
      void incoming
        .play()
        .then(() => {
          if (incomingRef.current !== layer || requestedThemeRef.current !== theme) {
            incoming.pause();
            return;
          }

          incoming.className = "is-active";
          incoming.dataset.active = "true";
          outgoing.element.pause();
          outgoing.element.remove();
          activeRef.current = layer;
          incomingRef.current = null;
        })
        .catch(() => {
          completing = false;
        });
    };

    incoming.addEventListener(
      "loadedmetadata",
      () => {
        const duration =
          Number.isFinite(incoming.duration) && incoming.duration > 0 ? incoming.duration : 0;
        const targetTime = duration > 0 ? capturedTime % duration : capturedTime;
        incoming.currentTime = targetTime;

        if (targetTime === 0 && incoming.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          completeSwap();
        }
      },
      { once: true },
    );
    incoming.addEventListener("seeked", completeSwap, { once: true });
    incoming.addEventListener("canplay", () => {
      if (Math.abs(incoming.currentTime - capturedTime) < 0.25) completeSwap();
    });
    incoming.addEventListener(
      "error",
      () => {
        if (incomingRef.current === layer) incomingRef.current = null;
        incoming.remove();
      },
      { once: true },
    );

    container.append(incoming);
  }, [theme]);

  useEffect(
    () => () => {
      incomingRef.current?.element.remove();
      activeRef.current?.element.pause();
      activeRef.current?.element.remove();
      incomingRef.current = null;
      activeRef.current = null;
    },
    [],
  );

  return <div ref={containerRef} className="marketing-video-background" aria-hidden="true" />;
}
