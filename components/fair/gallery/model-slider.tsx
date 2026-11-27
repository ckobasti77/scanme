"use client";

import Image from "next/image";
import { useReducedMotion } from "framer-motion";
import { ChevronDown, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { fairSliderDelay, fairSliderSlides, type FairModelGallery } from "@/lib/fair-gallery";
import { fmt } from "@/lib/i18n/format";
import { fairSalonSr as dict } from "@/lib/i18n/sr/fair-salon";
import styles from "./model-slider.module.css";

const SWIPE_PX = 40;

/**
 * The model page hero (Auto Expo): the photo slider fills the hero card and `children` (scrim,
 * stand chip, name and price) sit on top of it, as on the AMF model page. Arrows on the left and
 * right edge; colours hide behind a small chip in the top right corner that opens a row of
 * swatches under it. It starts moving on its own after a longer first wait, then every 7 s
 * (lib/fair-gallery); hover, focus, a finger on it or a hidden tab hold it, the pause button
 * stops it, and reduced motion never starts it. For the 360 sets a colour keeps the angle, for
 * configurator sets it jumps to that colour's photo.
 */
export function FairModelSlider({
  gallery,
  modelName,
  children,
}: {
  gallery: FairModelGallery;
  modelName: string;
  children?: ReactNode;
}) {
  const regionId = useId();
  const colorsId = useId();
  const reduceMotion = useReducedMotion();
  const [groupIndex, setGroupIndex] = useState(0);
  const [index, setIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [autoCount, setAutoCount] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [colorsOpen, setColorsOpen] = useState(false);
  const pointerX = useRef<number | null>(null);
  const cornerRef = useRef<HTMLDivElement>(null);

  const slides = useMemo(() => fairSliderSlides(gallery, groupIndex), [gallery, groupIndex]);
  const total = slides.length;
  const current = slides[Math.min(index, total - 1)];
  const running = !userPaused && !held && !hidden && !colorsOpen && !reduceMotion && total > 1;
  const delay = fairSliderDelay(autoCount);
  const activeGroup = gallery.mode === "angles" ? groupIndex : current?.groupIndex ?? null;
  const activeColor = activeGroup === null ? null : gallery.groups[activeGroup] ?? null;
  const hasColors = gallery.groups.length > 1;

  useEffect(() => {
    const onVisibility = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => {
      setIndex((value) => (value + 1) % total);
      setAutoCount((value) => value + 1);
      setCycle((value) => value + 1);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [running, delay, cycle, total]);

  // The colour row closes on a tap anywhere outside the corner cluster.
  useEffect(() => {
    if (!colorsOpen) return;
    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (!cornerRef.current?.contains(event.target as Node)) setColorsOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [colorsOpen]);

  const go = (next: number) => {
    setIndex(((next % total) + total) % total);
    setCycle((value) => value + 1);
  };

  const pickGroup = (gi: number) => {
    if (gallery.mode === "angles") {
      setGroupIndex(gi);
      setIndex((value) => Math.min(value, (gallery.groups[gi]?.slides.length ?? 1) - 1));
      setCycle((value) => value + 1);
      return;
    }
    const target = slides.findIndex((slide) => slide.groupIndex === gi);
    if (target >= 0) go(target);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && colorsOpen) {
      event.preventDefault();
      setColorsOpen(false);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      go(index + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(index - 1);
    }
  };

  // Swipes anywhere on the hero except on its own buttons and links.
  const fromControl = (event: PointerEvent<HTMLElement>) =>
    Boolean((event.target as Element).closest("button, a"));
  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (fromControl(event)) return;
    pointerX.current = event.clientX;
    if (event.pointerType !== "mouse") setHeld(true);
  };
  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    const start = pointerX.current;
    pointerX.current = null;
    if (event.pointerType !== "mouse") setHeld(false);
    if (start === null) return;
    const dx = event.clientX - start;
    if (Math.abs(dx) >= SWIPE_PX) go(index + (dx < 0 ? 1 : -1));
  };

  const altFor = (slideIndex: number) => {
    const slide = slides[slideIndex];
    const group = slide.groupIndex === null ? null : gallery.groups[slide.groupIndex];
    return group
      ? fmt(dict.sliderAltColor, { model: modelName, color: group.label.toLowerCase(), index: String(slide.indexInGroup + 1) })
      : fmt(dict.sliderAltPhoto, { model: modelName, index: String(slide.indexInGroup + 1) });
  };

  const near = (slideIndex: number) => {
    const distance = Math.abs(slideIndex - index);
    return distance <= 1 || distance === total - 1;
  };

  const paused = userPaused || Boolean(reduceMotion);

  return (
    <section
      className={styles.slider}
      aria-roledescription="carousel"
      aria-label={fmt(dict.sliderLabel, { model: modelName })}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHeld(false);
      }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        pointerX.current = null;
        setHeld(false);
      }}
    >
      <div id={regionId} className={styles.stage} aria-live={running ? "off" : "polite"}>
        {slides.map((slide, slideIndex) =>
          near(slideIndex) ? (
            <div
              key={slide.src}
              className={styles.slide}
              data-fit={slide.fit}
              data-framed={slide.box ? "" : undefined}
              style={slide.box ? carFrame(slide.box, slide.height / slide.width) : undefined}
              data-current={slideIndex === index ? "" : undefined}
              role="group"
              aria-roledescription="slide"
              aria-label={fmt(dict.sliderSlide, { index: String(slideIndex + 1), total: String(total) })}
              aria-hidden={slideIndex === index ? undefined : true}
            >
              <Image
                src={slide.src}
                alt={altFor(slideIndex)}
                fill
                sizes="(max-width: 767px) 100vw, 560px"
                priority={slideIndex === 0 && groupIndex === 0}
                draggable={false}
              />
            </div>
          ) : null,
        )}
      </div>

      {children}

      {total > 1 ? (
        <>
          <button
            type="button"
            className={styles.arrow}
            data-side="prev"
            aria-label={dict.sliderPrev}
            aria-controls={regionId}
            onClick={() => go(index - 1)}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.arrow}
            data-side="next"
            aria-label={dict.sliderNext}
            aria-controls={regionId}
            onClick={() => go(index + 1)}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </>
      ) : null}

      <div ref={cornerRef} className={styles.corner}>
        <div className={styles.cornerRow}>
          {hasColors ? (
            <button
              type="button"
              className={styles.colorsChip}
              aria-expanded={colorsOpen}
              aria-controls={colorsId}
              aria-label={fmt(dict.sliderColorsToggle, { color: activeColor?.label ?? "" })}
              onClick={() => setColorsOpen((value) => !value)}
            >
              <span
                className={styles.chipDot}
                aria-hidden="true"
                style={{ "--swatch": activeColor?.swatch ?? "transparent" } as CSSProperties}
              />
              <span className={styles.chipLabel}>{activeColor?.label ?? dict.sliderColors}</span>
              <ChevronDown aria-hidden="true" />
            </button>
          ) : null}
          {total > 1 ? (
            <button
              type="button"
              className={styles.pause}
              aria-label={paused ? dict.sliderPlay : dict.sliderPause}
              aria-pressed={!paused}
              onClick={() => {
                setUserPaused((value) => !value);
                setCycle((value) => value + 1);
              }}
            >
              {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
            </button>
          ) : null}
        </div>

        {hasColors ? (
          <div
            id={colorsId}
            className={styles.swatches}
            role="group"
            aria-label={dict.sliderColors}
            data-open={colorsOpen ? "" : undefined}
            inert={!colorsOpen}
          >
            {gallery.groups.map((group, gi) => (
              <button
                key={group.id}
                type="button"
                className={styles.swatch}
                aria-label={fmt(dict.sliderColor, { color: group.label })}
                aria-pressed={activeGroup === gi}
                title={group.label}
                style={{ "--swatch": group.swatch } as CSSProperties}
                onClick={() => pickGroup(gi)}
              />
            ))}
          </div>
        ) : null}
      </div>

      <span className={styles.progress} aria-hidden="true">
        <span
          key={`${cycle}-${running ? "run" : "hold"}`}
          data-running={running ? "" : undefined}
          style={{ "--slider-delay": `${delay}ms` } as CSSProperties}
        />
      </span>
    </section>
  );
}

/** A studio render framed on its car (`box`, fractions of the image): model-slider.module.css
 * scales the image so the car fills the hero and its wheels sit on the name and price line. */
function carFrame(box: readonly [number, number, number, number], ratio: number): CSSProperties {
  const [x0, y0, x1, y1] = box;
  return {
    "--car-w": x1 - x0,
    "--car-h": y1 - y0,
    "--car-cx": (x0 + x1) / 2,
    "--car-y1": y1,
    "--car-ratio": ratio,
  } as CSSProperties;
}
