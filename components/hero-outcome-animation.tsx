"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type Ref,
} from "react";
import { MapPin, Search, Star } from "lucide-react";
import { useReducedMotion } from "framer-motion";
import { gsap } from "gsap";
import {
  appendHeroQrScanSequence,
  HeroQrScanScene,
  QR_GLOW_BAND_HEIGHT,
  resetHeroQrScan,
  resolveHeroQrScanElements,
} from "@/components/hero-qr-scan-scene";
import {
  type HeroCarouselCycleAction,
  isHeroAnimationVisible,
  shouldPlayHeroAnimation,
} from "@/lib/hero-animation-playback";

function GoogleSegments({ monochrome = false }: { monochrome?: boolean }) {
  return (
    <>
      <path
        fill={monochrome ? "currentColor" : "#4285F4"}
        d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.482h4.844c-.209 1.125-.843 2.078-1.797 2.716v2.258h2.909c1.702-1.567 2.684-3.874 2.684-6.615Z"
      />
      <path
        fill={monochrome ? "currentColor" : "#34A853"}
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.909-2.258c-.806.54-1.835.859-3.047.859-2.344 0-4.328-1.585-5.037-3.711H.956v2.333C2.437 15.984 5.482 18 9 18Z"
      />
      <path
        fill={monochrome ? "currentColor" : "#FBBC05"}
        d="M3.963 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.281-1.71V4.957H.956A9.003 9.003 0 0 0 0 9c0 1.452.348 2.828.956 4.043l3.007-2.333Z"
      />
      <path
        fill={monochrome ? "currentColor" : "#EA4335"}
        d="M9 3.58c1.321 0 2.508.454 3.443 1.345l2.581-2.581C13.464.892 11.426 0 9 0 5.482 0 2.437 2.016.956 4.957L3.963 7.29C4.672 5.164 6.656 3.58 9 3.58Z"
      />
    </>
  );
}

function GoogleMark({
  className = "",
  mode = "color",
  markRef,
  revealRef,
  dataMark,
}: {
  className?: string;
  mode?: "color" | "scan";
  markRef?: Ref<SVGSVGElement>;
  revealRef?: Ref<SVGRectElement>;
  dataMark: "qr" | "reviews" | "maps";
}) {
  const clipId = `google-reveal-${useId().replaceAll(":", "")}`;

  return (
    <svg
      ref={markRef}
      data-google-mark={dataMark}
      className={`block ${className}`}
      viewBox="0 0 18 18"
      role="presentation"
    >
      {mode === "scan" ? (
        <>
          <defs>
            <clipPath id={clipId}>
              <rect
                ref={revealRef}
                x="0"
                y="0"
                width="18"
                height="18"
                style={{
                  transform: "scaleY(0)",
                  transformBox: "fill-box",
                  transformOrigin: "50% 0%",
                }}
              />
            </clipPath>
          </defs>
          <g data-google-mark-mono className="text-[#5d625c]">
            <GoogleSegments monochrome />
          </g>
          <g
            data-google-mark-color
            clipPath={`url(#${clipId})`}
            style={{ opacity: 0, visibility: "hidden" }}
          >
            <GoogleSegments />
          </g>
        </>
      ) : (
        <g data-google-mark-color>
          <GoogleSegments />
        </g>
      )}
    </svg>
  );
}

function ReviewStars({
  large = false,
  rating = 5,
}: {
  large?: boolean;
  rating?: number;
}) {
  const starSize = large
    ? "size-[clamp(0.75rem,3.6cqi,1.35rem)]"
    : "size-[clamp(0.42rem,1.7cqi,0.7rem)]";

  return (
    <span
      data-rating={rating}
      className="flex items-center gap-[clamp(0.1rem,0.55cqi,0.25rem)] text-[#fbbc05]"
    >
      {Array.from({ length: 5 }, (_, index) => {
        const fill = Math.min(1, Math.max(0, rating - index));

        return (
          <span key={index} className={`relative block shrink-0 ${starSize}`}>
            <Star
              aria-hidden="true"
              className="absolute inset-0 size-full text-[#fbbc05]/45"
              strokeWidth={1.25}
            />
            {fill > 0 ? (
              <Star
                aria-hidden="true"
                data-star-fill={fill}
                className="absolute inset-0 size-full fill-current"
                strokeWidth={1.25}
                style={{ clipPath: `inset(0 ${(1 - fill) * 100}% 0 0)` }}
              />
            ) : null}
          </span>
        );
      })}
    </span>
  );
}

type HeroAnimationProps = {
  active?: boolean;
  paused?: boolean;
  onCycleBoundary?: () => HeroCarouselCycleAction;
};

export function HeroOutcomeAnimation({
  active = true,
  paused = false,
  onCycleBoundary,
}: HeroAnimationProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const googleMarkRef = useRef<SVGSVGElement>(null);
  const googleColorRevealRef = useRef<SVGRectElement>(null);
  const reviewPanelRef = useRef<HTMLDivElement>(null);
  const reviewCounterValueRef = useRef<HTMLSpanElement>(null);
  const mapCounterValueRef = useRef<HTMLSpanElement>(null);
  const travelCounterRef = useRef<HTMLDivElement>(null);
  const travelCounterValueRef = useRef<HTMLSpanElement>(null);
  const mapSceneRef = useRef<HTMLDivElement>(null);
  const mapResultListRef = useRef<HTMLDivElement>(null);
  const firstResultRef = useRef<HTMLDivElement>(null);
  const secondResultRef = useRef<HTMLDivElement>(null);
  const localResultRef = useRef<HTMLDivElement>(null);
  const activePinRef = useRef<HTMLDivElement>(null);
  const pinPulseRef = useRef<HTMLSpanElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const activeRef = useRef(active);
  const pausedRef = useRef(paused);
  const visibleRef = useRef(false);
  const cycleActionRef = useRef<HeroCarouselCycleAction>("repeat");
  const onCycleBoundaryRef = useRef(onCycleBoundary);
  const syncPlaybackRef = useRef<() => void>(() => undefined);
  const reduceMotion = Boolean(useReducedMotion());

  useEffect(() => {
    onCycleBoundaryRef.current = onCycleBoundary;
  }, [onCycleBoundary]);

  useLayoutEffect(() => {
    const wasActive = activeRef.current;
    activeRef.current = active;
    pausedRef.current = paused;

    if (active && !wasActive) {
      timelineRef.current?.restart();
    }

    syncPlaybackRef.current();
  }, [active, paused]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const qrElements = resolveHeroQrScanElements(root);
    const googleMark = googleMarkRef.current;
    const googleColorReveal = googleColorRevealRef.current;
    const googleColorLayer = googleMark?.querySelector<SVGGElement>(
      "[data-google-mark-color]",
    );
    const reviewPanel = reviewPanelRef.current;
    const reviewCounterValue = reviewCounterValueRef.current;
    const mapCounterValue = mapCounterValueRef.current;
    const travelCounter = travelCounterRef.current;
    const travelCounterValue = travelCounterValueRef.current;
    const mapScene = mapSceneRef.current;
    const resultList = mapResultListRef.current;
    const firstResult = firstResultRef.current;
    const secondResult = secondResultRef.current;
    const localResult = localResultRef.current;
    const activePin = activePinRef.current;
    const pinPulse = pinPulseRef.current;

    if (
      !qrElements ||
      !googleMark ||
      !googleColorReveal ||
      !googleColorLayer ||
      !reviewPanel ||
      !reviewCounterValue ||
      !mapCounterValue ||
      !travelCounter ||
      !travelCounterValue ||
      !mapScene ||
      !resultList ||
      !firstResult ||
      !secondResult ||
      !localResult ||
      !activePin ||
      !pinPulse
    ) {
      return;
    }

    let observer: IntersectionObserver | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let visibilityHandler: (() => void) | null = null;

    const context = gsap.context(() => {
      const rowStep = () => resultList.clientHeight * 0.355;
      const counterProgress = { value: 0 };
      const numberFormatter = new Intl.NumberFormat("sr-RS");

      const centerInRoot = (element: Element) => {
        const rootBox = root.getBoundingClientRect();
        const elementBox = element.getBoundingClientRect();
        return {
          x:
            elementBox.left +
            elementBox.width / 2 -
            rootBox.left -
            root.clientLeft,
          y:
            elementBox.top +
            elementBox.height / 2 -
            rootBox.top -
            root.clientTop,
        };
      };
      const travelStartX = () => centerInRoot(reviewCounterValue).x;
      const travelStartY = () => centerInRoot(reviewCounterValue).y;
      const travelTargetX = () => centerInRoot(mapCounterValue).x;
      const travelTargetY = () => {
        const mapSceneOffsetY =
          Number.parseFloat(String(gsap.getProperty(mapScene, "y"))) || 0;
        return centerInRoot(mapCounterValue).y - mapSceneOffsetY;
      };
      const travelTargetScale = () => {
        const reviewBox = reviewCounterValue.getBoundingClientRect();
        const mapBox = mapCounterValue.getBoundingClientRect();
        return reviewBox.height > 0 ? mapBox.height / reviewBox.height : 1;
      };

      const renderCounter = () => {
        const value = 21 + Math.floor(counterProgress.value * 1260);
        const formattedValue = numberFormatter.format(value);
        reviewCounterValue.textContent = formattedValue;
        mapCounterValue.textContent = formattedValue;
        travelCounterValue.textContent = formattedValue;
        root.dataset.reviewCount = String(value);
      };

      const setPhase = (phase: string) => {
        root.dataset.heroPhase = phase;
      };

      const setRank = (rank: string) => {
        localResult.dataset.localRank = rank;
      };

      resetHeroQrScan(qrElements);
      gsap.set(googleColorReveal, { scaleY: 0, transformOrigin: "50% 0%" });
      gsap.set(googleColorLayer, { autoAlpha: 0 });
      gsap.set(reviewPanel, { autoAlpha: 0, y: 10 });
      gsap.set(reviewCounterValue, { autoAlpha: 1 });
      gsap.set(mapCounterValue, { autoAlpha: 0 });
      gsap.set(travelCounter, { autoAlpha: 0, x: 0, y: 0, scale: 1 });
      gsap.set(mapScene, { autoAlpha: 0, y: 12 });
      gsap.set(firstResult, { y: 0 });
      gsap.set(secondResult, { y: rowStep });
      gsap.set(localResult, { y: () => rowStep() * 2 });
      gsap.set(activePin, { y: 0, scale: 1 });
      gsap.set(pinPulse, { autoAlpha: 0, scale: 0.7 });
      renderCounter();
      setPhase("qr");
      setRank("3");

      if (reduceMotion) {
        counterProgress.value = 0.42;
        renderCounter();
        gsap.set(qrElements.scene, { autoAlpha: 0 });
        gsap.set(mapScene, { autoAlpha: 1, y: 0 });
        gsap.set(firstResult, { y: rowStep });
        gsap.set(secondResult, { y: () => rowStep() * 2 });
        gsap.set(localResult, { y: 0 });
        gsap.set(activePin, { y: -10, scale: 1.08 });
        gsap.set(mapCounterValue, { autoAlpha: 1 });
        setPhase("map-static");
        setRank("1");
        return;
      }

      const timeline = gsap.timeline({
        paused: true,
        onComplete: () => {
          if (activeRef.current && cycleActionRef.current === "repeat") {
            timeline.restart();
            syncPlaybackRef.current();
          }
        },
      });
      timelineRef.current = timeline;

      timeline
        .call(() => {
          cycleActionRef.current = "repeat";
          counterProgress.value = 0;
          renderCounter();
          setPhase("qr");
          setRank("3");
          resetHeroQrScan(qrElements);
          gsap.set(googleColorReveal, { scaleY: 0 });
          gsap.set(googleColorLayer, { autoAlpha: 0 });
        }, [], 0);

      appendHeroQrScanSequence({
        timeline,
        elements: qrElements,
        onProgress: (_progress, lineCenterY) => {
          const markBox = googleMark.getBoundingClientRect();
          const markProgress = gsap.utils.clamp(
            0,
            1,
            (lineCenterY - markBox.top) / Math.max(1, markBox.height),
          );
          gsap.set(googleColorReveal, { scaleY: markProgress });
        },
      });
      timeline.set(googleColorLayer, { autoAlpha: 1 }, 0.34);

      timeline
        .call(() => setPhase("reviews"), [], 2.82)
        .to(reviewPanel, { autoAlpha: 1, y: 0, duration: 0.42, ease: "power3.out" }, 2.8)
        .to(
          counterProgress,
          {
            value: 0.055,
            duration: 3.07,
            ease: "none",
            onUpdate: renderCounter,
          },
          3.15,
        )
        .to(
          counterProgress,
          {
            value: 1.35,
            duration: 3.34,
            ease: (progress: number) => 0.12 * progress + 0.88 * progress * progress,
            onUpdate: renderCounter,
          },
          6.24,
        )
        .call(() => setPhase("maps"), [], 5.48)
        .set(
          travelCounter,
          {
            autoAlpha: 1,
            x: travelStartX,
            y: travelStartY,
            scale: 1,
          },
          5.28,
        )
        .set(reviewCounterValue, { autoAlpha: 0 }, 5.28)
        .to(reviewPanel, { autoAlpha: 0, y: -6, duration: 0.28, ease: "power2.in" }, 5.28)
        .to(mapScene, { autoAlpha: 1, y: 0, duration: 0.52, ease: "power3.out" }, 5.51)
        .to(
          travelCounter,
          {
            x: travelTargetX,
            y: travelTargetY,
            scale: travelTargetScale,
            duration: 0.72,
            ease: "power3.inOut",
          },
          5.32,
        )
        .set(mapCounterValue, { autoAlpha: 1 }, 6.04)
        .set(travelCounter, { autoAlpha: 0 }, 6.04)
        .call(() => {
          setPhase("ranking");
          setRank("1");
        }, [], 6.22)
        .to(firstResult, { y: rowStep, duration: 1.16, ease: "power3.inOut" }, 6.24)
        .to(secondResult, { y: () => rowStep() * 2, duration: 1.16, ease: "power3.inOut" }, 6.24)
        .to(localResult, { y: 0, duration: 1.16, ease: "power3.inOut" }, 6.24)
        .to(activePin, { y: -10, scale: 1.08, duration: 1.05, ease: "power3.inOut" }, 6.32)
        .to(pinPulse, { autoAlpha: 0.5, scale: 1.15, duration: 0.48, ease: "power2.out" }, 7.08)
        .to(pinPulse, { autoAlpha: 0, scale: 1.48, duration: 0.58, ease: "power2.out" }, 7.42)
        .call(() => {
          const action = onCycleBoundaryRef.current?.() ?? "repeat";
          cycleActionRef.current = action;
          if (action === "switch") {
            setPhase("switch-ready");
            timeline.pause();
          } else {
            setPhase("reset");
          }
        }, [], 9.25)
        .to(mapScene, { autoAlpha: 0, y: -6, duration: 0.3, ease: "power2.in" }, 9.25)
        .set(googleColorReveal, { scaleY: 0 }, 9.45)
        .set(googleColorLayer, { autoAlpha: 0 }, 9.45)
        .set(
          qrElements.glowBand,
          { attr: { y: -QR_GLOW_BAND_HEIGHT } },
          9.45,
        )
        .set(qrElements.glowGroup, { autoAlpha: 0 }, 9.45)
        .to(
          qrElements.scene,
          { autoAlpha: 1, y: 0, duration: 0.27, ease: "power2.out" },
          9.53,
        )
        .set(reviewPanel, { autoAlpha: 0, y: 10 }, 9.8)
        .set(reviewCounterValue, { autoAlpha: 1 }, 9.8)
        .set(mapCounterValue, { autoAlpha: 0 }, 9.8)
        .set(travelCounter, { autoAlpha: 0, x: 0, y: 0, scale: 1 }, 9.8)
        .set(mapScene, { autoAlpha: 0, y: 12 }, 9.8)
        .set(firstResult, { y: 0 }, 9.8)
        .set(secondResult, { y: rowStep }, 9.8)
        .set(localResult, { y: () => rowStep() * 2 }, 9.8)
        .set(activePin, { y: 0, scale: 1 }, 9.8)
        .set(pinPulse, { autoAlpha: 0, scale: 0.7 }, 9.8);

      const syncPlayback = () => {
        if (shouldPlayHeroAnimation({
          active: activeRef.current,
          visible: visibleRef.current,
          paused: pausedRef.current,
          documentHidden: document.hidden,
        })) {
          timeline.play();
        } else {
          timeline.pause();
        }
      };
      syncPlaybackRef.current = syncPlayback;

      visibleRef.current = isHeroAnimationVisible(
        root.getBoundingClientRect(),
        window.innerWidth,
        window.innerHeight,
      );
      syncPlayback();

      observer = new IntersectionObserver(
        ([entry]) => {
          visibleRef.current = entry.isIntersecting;
          syncPlayback();
        },
        { threshold: 0.12 },
      );
      resizeObserver = new ResizeObserver(() => timeline.invalidate());
      visibilityHandler = syncPlayback;

      observer.observe(root);
      resizeObserver.observe(root);
      document.addEventListener("visibilitychange", visibilityHandler);
    }, root);

    return () => {
      timelineRef.current = null;
      syncPlaybackRef.current = () => undefined;
      visibleRef.current = false;
      observer?.disconnect();
      resizeObserver?.disconnect();
      if (visibilityHandler) {
        document.removeEventListener("visibilitychange", visibilityHandler);
      }
      context.revert();
    };
  }, [reduceMotion]);

  return (
    <div
      ref={rootRef}
      data-hero-outcome
      data-hero-phase="qr"
      data-review-count="21"
      className="relative aspect-square w-full select-none overflow-hidden border border-foreground/14 bg-card [container-type:inline-size]"
      style={{ WebkitUserSelect: "none" }}
      aria-hidden="true"
    >
      <div className="scan-frame pointer-events-none absolute inset-[clamp(0.65rem,3.2cqi,1.25rem)] z-40">
        <i />
        <i />
        <i />
        <i />
      </div>

      <HeroQrScanScene
        center={
          <GoogleMark
            dataMark="qr"
            mode="scan"
            markRef={googleMarkRef}
            revealRef={googleColorRevealRef}
            className="size-full"
          />
        }
      />

      <div
        ref={reviewPanelRef}
        data-review-panel
        className="invisible absolute bottom-[14%] left-[11%] right-[11%] top-[14%] z-20 border border-foreground/16 bg-background/94"
        style={{ opacity: 0 }}
      >
        <div className="absolute inset-x-0 top-0 flex h-[18%] items-center gap-[clamp(0.45rem,2cqi,0.8rem)] border-b border-foreground/12 px-[clamp(0.65rem,3cqi,1.1rem)]">
          <GoogleMark dataMark="reviews" className="size-[clamp(0.9rem,4cqi,1.45rem)]" />
          <span className="text-[clamp(0.62rem,2.6cqi,0.88rem)] font-medium tracking-[-0.025em] text-foreground/78">
            Google recenzije
          </span>
          <span className="ml-auto h-px w-[18%] bg-foreground/16" />
        </div>

        <span
          ref={reviewCounterValueRef}
          data-review-live-count
          className="absolute left-1/2 top-[45%] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[clamp(3.5rem,20cqi,7.25rem)] font-semibold leading-none tracking-[-0.08em] text-primary tabular-nums"
        >
          21
        </span>

        <div className="absolute left-1/2 top-[61%] -translate-x-1/2">
          <ReviewStars large rating={4.5} />
        </div>

        <div className="absolute bottom-[8%] left-[8%] right-[8%] grid gap-[clamp(0.45rem,2cqi,0.75rem)]">
          <div className="flex items-center gap-[clamp(0.45rem,2cqi,0.7rem)]">
            <span className="size-[clamp(0.7rem,3cqi,1.05rem)] shrink-0 rounded-full bg-[#4285f4]/45" />
            <span className="grid flex-1 gap-[clamp(0.2rem,0.8cqi,0.32rem)]">
              <span className="h-px w-[44%] bg-foreground/28" />
              <span className="h-px w-[72%] bg-foreground/12" />
            </span>
          </div>
          <div className="flex items-center gap-[clamp(0.45rem,2cqi,0.7rem)]">
            <span className="size-[clamp(0.7rem,3cqi,1.05rem)] shrink-0 rounded-full bg-[#34a853]/45" />
            <span className="grid flex-1 gap-[clamp(0.2rem,0.8cqi,0.32rem)]">
              <span className="h-px w-[58%] bg-foreground/28" />
              <span className="h-px w-[63%] bg-foreground/12" />
            </span>
          </div>
        </div>
      </div>

      <div
        ref={travelCounterRef}
        data-travel-review-count
        className="invisible pointer-events-none absolute left-0 top-0 z-30 h-0 w-0 origin-top-left"
        style={{ opacity: 0 }}
      >
        <span
          ref={travelCounterValueRef}
          className="inline-block -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[clamp(3.5rem,20cqi,7.25rem)] font-semibold leading-none tracking-[-0.08em] text-primary tabular-nums"
        >
          21
        </span>
      </div>

      <div ref={mapSceneRef} className="invisible absolute inset-0" style={{ opacity: 0 }}>
        <svg
          className="absolute inset-0 size-full text-foreground"
          viewBox="0 0 100 100"
          role="presentation"
        >
          <rect width="100" height="100" fill="var(--card)" />

          <g data-map-landmark="usce" fill="#34a853" fillOpacity="0.12">
            <path d="M0 0H15C14 18 16 33 13 49 10 67 12 83 8 100H0Z" />
            <path d="M7 2c5 9 4 18 2 28S6 50 8 66L2 72V2Z" fillOpacity="0.08" />
          </g>

          <g data-map-landmark="kalemegdan" fill="#34a853" fillOpacity="0.15">
            <path d="M28 4c9-2 19 1 25 7l-4 12-11 7-12-6-2-11Z" />
            <path d="m30 9 11-2 7 5-3 8-8 5-8-4Z" fillOpacity="0.1" />
          </g>

          <path
            data-map-landmark="sava"
            d="M13-7c2 18 5 34 3 50-2 18-1 39 5 64h13c-7-25-8-45-5-62 3-17 2-34-1-52Z"
            fill="#78cfe4"
            fillOpacity="0.38"
          />
          <path
            d="M23-7c3 18 4 36 1 53-3 18-1 38 6 61"
            fill="none"
            stroke="#c9edf5"
            strokeOpacity="0.3"
            strokeWidth="0.8"
          />

          <g fill="currentColor" fillOpacity="0.035">
            <path d="M34 31h13l4 10-12 8-8-7Z" />
            <path d="m51 19 13-7 9 9-8 10-12-2Z" />
            <path d="m70 8 16 2 6 12-14 8-10-9Z" />
            <path d="m60 35 15-8 8 9-6 11-14 2Z" />
            <path d="m83 31 17-4v19l-12 4-7-8Z" />
            <path d="m35 56 14-7 9 9-6 12-16 1Z" />
            <path d="m60 55 13-4 11 10-7 12-15-3Z" />
            <path d="m84 55 16-4v23l-13 2-7-11Z" />
          </g>

          <g
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeOpacity="0.16"
            strokeWidth="1"
          >
            <path d="M29 43c15 4 27 5 40 0 12-5 21-4 34 1" />
            <path d="M31 66c16-1 30 2 42 10 8 5 17 8 29 10" />
            <path d="M48-4c-1 18 5 31 17 41 12 10 20 23 23 39" />
          </g>

          <g data-map-landmark="brankov-most">
            <path
              d="M-4 55C9 54.3 22 53.2 35 52"
              fill="none"
              stroke="#6f8fae"
              strokeOpacity="0.86"
              strokeWidth="3.1"
              strokeLinecap="round"
            />
            <path
              d="M-4 55C9 54.3 22 53.2 35 52"
              fill="none"
              stroke="#d4e0e8"
              strokeOpacity="0.66"
              strokeWidth="1.05"
              strokeLinecap="round"
            />
            <path
              d="M34.5 52C48 51.2 58 48.3 68 43.6 80 38.4 91 39 104 44"
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.19"
              strokeWidth="1.05"
              strokeLinecap="round"
            />
          </g>

          <g
            fill="currentColor"
            fillOpacity="0.42"
            fontFamily="var(--font-plex-mono)"
            fontSize="2.5"
          >
            <text x="19" y="38" textAnchor="middle" transform="rotate(-88 19 38)">
              Sava
            </text>
          </g>
        </svg>

        <div className="absolute left-[7%] right-[7%] top-[6%] flex h-[10%] items-center gap-[clamp(0.4rem,2cqi,0.75rem)] border border-foreground/16 bg-background/94 px-[clamp(0.55rem,2.6cqi,1rem)]">
          <GoogleMark dataMark="maps" className="size-[clamp(0.78rem,3.5cqi,1.25rem)]" />
          <span className="text-[clamp(0.58rem,2.4cqi,0.82rem)] font-medium tracking-[-0.025em] text-foreground/76">
            Google Maps
          </span>
          <Search
            aria-hidden="true"
            className="ml-auto size-[clamp(0.7rem,2.8cqi,1rem)] text-foreground/44"
            strokeWidth={1.5}
          />
        </div>

        <div className="absolute right-[24%] top-[28%] text-[#ea4335]">
          <MapPin
            aria-hidden="true"
            className="size-[clamp(1rem,4.8cqi,1.75rem)] fill-current/20"
            strokeWidth={1.6}
          />
        </div>
        <div className="absolute right-[10%] top-[41%] text-[#4285f4]">
          <MapPin
            aria-hidden="true"
            className="size-[clamp(0.9rem,4.2cqi,1.5rem)] fill-current/20"
            strokeWidth={1.6}
          />
        </div>
        <div
          ref={activePinRef}
          data-active-map-pin
          className="absolute left-[51%] top-[39%] z-10"
          style={{ color: "var(--primary)" }}
        >
          <span
            ref={pinPulseRef}
            className="absolute left-1/2 top-1/2 size-[150%] -translate-x-1/2 -translate-y-1/2 border border-primary"
            style={{ opacity: 0 }}
          />
          <MapPin
            aria-hidden="true"
            className="relative size-[clamp(1.15rem,5.5cqi,2rem)] fill-current/20"
            strokeWidth={1.7}
          />
        </div>

        <div
          ref={mapResultListRef}
          className="absolute bottom-[5%] left-[7%] right-[7%] h-[36%]"
        >
          <div
            ref={firstResultRef}
            data-map-result="first"
            className="absolute inset-x-0 top-0 flex h-[29%] items-center gap-[clamp(0.4rem,2cqi,0.7rem)] border border-foreground/12 bg-background/94 px-[clamp(0.5rem,2.6cqi,0.9rem)]"
          >
            <span className="size-[clamp(0.8rem,3.4cqi,1.25rem)] border border-[#ea4335]/55" />
            <span className="grid flex-1 gap-[clamp(0.18rem,0.8cqi,0.3rem)]">
              <span className="h-px w-[42%] bg-foreground/34" />
              <span className="h-px w-[66%] bg-foreground/14" />
            </span>
            <ReviewStars rating={3.5} />
          </div>

          <div
            ref={secondResultRef}
            data-map-result="second"
            className="absolute inset-x-0 top-0 flex h-[29%] items-center gap-[clamp(0.4rem,2cqi,0.7rem)] border border-foreground/12 bg-background/94 px-[clamp(0.5rem,2.6cqi,0.9rem)]"
          >
            <span className="size-[clamp(0.8rem,3.4cqi,1.25rem)] border border-[#4285f4]/55" />
            <span className="grid flex-1 gap-[clamp(0.18rem,0.8cqi,0.3rem)]">
              <span className="h-px w-[56%] bg-foreground/34" />
              <span className="h-px w-[38%] bg-foreground/14" />
            </span>
            <ReviewStars rating={4} />
          </div>

          <div
            ref={localResultRef}
            data-local-rank="3"
            data-map-result="local"
            className="absolute inset-x-0 top-0 flex h-[29%] items-center gap-[clamp(0.4rem,2cqi,0.7rem)] border border-primary/70 bg-background/96 px-[clamp(0.5rem,2.6cqi,0.9rem)]"
          >
            <MapPin
              aria-hidden="true"
              data-local-card-pin
              className="size-[clamp(0.85rem,3.8cqi,1.4rem)] shrink-0 fill-current/20"
              strokeWidth={1.7}
              style={{ color: "var(--primary)" }}
            />
            <span className="grid min-w-0 flex-1 gap-[clamp(0.12rem,0.6cqi,0.25rem)]">
              <span className="truncate text-[clamp(0.62rem,2.8cqi,0.95rem)] font-semibold tracking-[-0.03em] text-foreground">
                Vaš lokal
              </span>
              <ReviewStars rating={4.5} />
            </span>
            <span
              data-map-counter-slot
              className="min-w-[clamp(3.4rem,15cqi,5.8rem)] shrink-0 self-center whitespace-nowrap text-right text-[clamp(1rem,4.8cqi,1.75rem)] font-semibold leading-none tracking-[-0.08em] text-primary tabular-nums"
            >
              <span
                ref={mapCounterValueRef}
                data-map-live-review-count
                className="inline-block"
              >
                21
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
