"use client";

import Image from "next/image";
import { useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { fairSliderDelay, fairSliderSlides, type FairModelGallery } from "@/lib/fair-gallery";
import { fmt } from "@/lib/i18n/format";
import { fairSalonSr as dict } from "@/lib/i18n/sr/fair-salon";
import styles from "./model-slider.module.css";

const SWIPE_PX = 40;

/**
 * The model page photo slider (Auto Expo). It starts moving on its own after a longer first wait,
 * then every 7 s (lib/fair-gallery); hover, focus, a finger on it or a hidden tab hold it, the
 * pause button stops it, and reduced motion never starts it. Colours are swatches: for the 360
 * sets a colour keeps the angle, for configurator sets it jumps to that colour's photo.
 */
export function FairModelSlider({ gallery, modelName }: { gallery: FairModelGallery; modelName: string }) {
  const regionId = useId();
  const reduceMotion = useReducedMotion();
  const [groupIndex, setGroupIndex] = useState(0);
  const [index, setIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [autoCount, setAutoCount] = useState(0);
  const [cycle, setCycle] = useState(0);
  const pointerX = useRef<number | null>(null);

  const slides = useMemo(() => fairSliderSlides(gallery, groupIndex), [gallery, groupIndex]);
  const total = slides.length;
  const current = slides[Math.min(index, total - 1)];
  const running = !userPaused && !held && !hidden && !reduceMotion && total > 1;
  const delay = fairSliderDelay(autoCount);
  const activeGroup = gallery.mode === "angles" ? groupIndex : current?.groupIndex ?? null;

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
    if (event.key === "ArrowRight") {
      event.preventDefault();
      go(index + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(index - 1);
    }
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    pointerX.current = event.clientX;
    if (event.pointerType !== "mouse") setHeld(true);
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
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
    >
      <div
        id={regionId}
        className={styles.stage}
        aria-live={running ? "off" : "polite"}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          pointerX.current = null;
          setHeld(false);
        }}
      >
        {slides.map((slide, slideIndex) =>
          near(slideIndex) ? (
            <div
              key={slide.src}
              className={styles.slide}
              data-fit={slide.fit}
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

        <div className={styles.controls}>
          <button type="button" className={styles.arrow} aria-label={dict.sliderPrev} aria-controls={regionId} onClick={() => go(index - 1)}>
            <ChevronLeft aria-hidden="true" />
          </button>
          <span className={styles.counter} aria-hidden="true">
            {String(index + 1).padStart(2, "0")}
            <span>/</span>
            {String(total).padStart(2, "0")}
          </span>
          <button type="button" className={styles.arrow} aria-label={dict.sliderNext} aria-controls={regionId} onClick={() => go(index + 1)}>
            <ChevronRight aria-hidden="true" />
          </button>
        </div>

        <button
          type="button"
          className={styles.pause}
          aria-label={userPaused || reduceMotion ? dict.sliderPlay : dict.sliderPause}
          aria-pressed={!(userPaused || reduceMotion)}
          onClick={() => {
            setUserPaused((value) => !value);
            setCycle((value) => value + 1);
          }}
        >
          {userPaused || reduceMotion ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
        </button>

        <span className={styles.progress} aria-hidden="true">
          <span
            key={`${cycle}-${running ? "run" : "hold"}`}
            data-running={running ? "" : undefined}
            style={{ "--slider-delay": `${delay}ms` } as CSSProperties}
          />
        </span>
      </div>

      {gallery.groups.length > 1 ? (
        <div className={styles.swatches} role="group" aria-label={dict.sliderColors}>
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
          <span className={styles.swatchLabel}>{activeGroup === null ? "" : gallery.groups[activeGroup]?.label}</span>
        </div>
      ) : null}
    </section>
  );
}
