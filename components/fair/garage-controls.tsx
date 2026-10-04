"use client";

import gsap from "gsap";
import { CarFront } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  addFairGarageModel,
  getFairGarageModels,
  hasFairGarageModel,
  readFairGarage,
  removeFairGarageModel,
  writeFairGarage,
  type FairGarageLastKnownModel,
} from "@/lib/fair-client/garage-store";
import { fmt } from "@/lib/i18n";

const FAIR_GARAGE_CHANGE_EVENT = "scanme:fair-garage-change";
const FAIR_GARAGE_MODEL_CHANGE_EVENT = "scanme:fair-garage-model-change";

function subscribeToGarageEvent(eventName: string, onStoreChange: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === "scanme:fair-garage" || event.key === null) onStoreChange();
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(eventName, onStoreChange);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(eventName, onStoreChange);
  };
}

const subscribeGarageBadge = (onStoreChange: () => void) =>
  subscribeToGarageEvent(FAIR_GARAGE_CHANGE_EVENT, onStoreChange);

const subscribeGarageModel = (onStoreChange: () => void) =>
  subscribeToGarageEvent(FAIR_GARAGE_MODEL_CHANGE_EVENT, onStoreChange);

function getGarageCount(eventId: string) {
  return getFairGarageModels(readFairGarage(window.localStorage).document, eventId).length;
}

function hasModel(eventId: string, modelId: string) {
  return hasFairGarageModel(readFairGarage(window.localStorage).document, eventId, modelId);
}

export function GarageBadge({
  eventId,
  ariaTemplate,
}: {
  eventId: string;
  ariaTemplate: string;
}) {
  const count = useSyncExternalStore(
    subscribeGarageBadge,
    () => getGarageCount(eventId),
    () => 0,
  );

  return (
    <span
      className="fair-garage-badge"
      aria-label={fmt(ariaTemplate, { count })}
    >
      <span key={count} className="fair-garage-badge__value" aria-hidden="true">
        {count}
      </span>
    </span>
  );
}

export function GarageSaveButton({
  eventId,
  modelId,
  lastKnown,
  saveLabel,
  savedLabel,
  errorLabel,
}: {
  eventId: string;
  modelId: string;
  lastKnown: FairGarageLastKnownModel;
  saveLabel: string;
  savedLabel: string;
  errorLabel: string;
}) {
  const [writeFailed, setWriteFailed] = useState(false);
  const saveBarRef = useRef<HTMLDivElement | null>(null);
  const saveButtonRef = useRef<HTMLButtonElement | null>(null);
  const saveSurfaceRef = useRef<HTMLSpanElement | null>(null);
  const morphStartRef = useRef<{ radius: number; width: number } | null>(null);
  const morphTweenRef = useRef<gsap.core.Tween | null>(null);
  const flightTimelineRef = useRef<gsap.core.Timeline | null>(null);
  const flightElementRef = useRef<HTMLImageElement | null>(null);
  const saved = useSyncExternalStore(
    subscribeGarageModel,
    () => hasModel(eventId, modelId),
    () => false,
  );

  useEffect(() => {
    return () => {
      morphTweenRef.current?.kill();
      flightTimelineRef.current?.kill();
      flightElementRef.current?.remove();
    };
  }, []);

  useLayoutEffect(() => {
    const button = saveButtonRef.current;
    const surface = saveSurfaceRef.current;
    const bar = saveBarRef.current;
    const start = morphStartRef.current;
    if (!button || !surface || !bar || !start) return;

    morphStartRef.current = null;
    morphTweenRef.current?.kill();

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const targetWidth = saved ? Math.min(220, bar.clientWidth) : bar.clientWidth;
    const targetRadius = saved ? targetWidth / 2 : 14;

    if (reducedMotion) {
      gsap.set(surface, { clearProps: "borderRadius,width" });
      return;
    }

    gsap.set(surface, {
      width: start.width,
      borderRadius: start.radius,
    });
    morphTweenRef.current = gsap.to(surface, {
      width: targetWidth,
      borderRadius: targetRadius,
      duration: 0.42,
      ease: "sine.inOut",
      overwrite: true,
      onComplete: () => {
        gsap.set(surface, { clearProps: "borderRadius,width" });
        morphTweenRef.current = null;
      },
    });
  }, [saved]);

  function animateToGarage(onDock: () => void) {
    const target = document.querySelector<HTMLElement>(".fair-garage-icon");
    const source = document.querySelector<HTMLImageElement>(".fair-model-hero__image");
    if (!target) {
      onDock();
      return;
    }
    if (!source || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      gsap.killTweensOf(target);
      gsap.fromTo(
        target,
        { scale: 0.92 },
        {
          scale: 1,
          duration: 0.3,
          ease: "back.out(1.5)",
          clearProps: "transform",
          onComplete: onDock,
        },
      );
      return;
    }

    const sourceBounds = source.getBoundingClientRect();
    const targetBounds = target.getBoundingClientRect();
    const flight = document.createElement("img");
    flight.src = source.currentSrc || source.src;
    flight.alt = "";
    flight.className = "fair-garage-flight";
    Object.assign(flight.style, {
      top: `${sourceBounds.top}px`,
      left: `${sourceBounds.left}px`,
      width: `${sourceBounds.width}px`,
      height: `${sourceBounds.height}px`,
      objectPosition: getComputedStyle(source).objectPosition,
    });
    document.body.appendChild(flight);
    flightElementRef.current?.remove();
    flightElementRef.current = flight;

    const deltaX =
      targetBounds.left + targetBounds.width / 2 - (sourceBounds.left + sourceBounds.width / 2);
    const deltaY =
      targetBounds.top + targetBounds.height / 2 - (sourceBounds.top + sourceBounds.height / 2);
    const targetScale = Math.max(0.06, targetBounds.width / sourceBounds.width);
    let docked = false;
    const removeFlight = () => {
      flight.remove();
      if (flightElementRef.current === flight) flightElementRef.current = null;
      if (!docked) {
        docked = true;
        onDock();
      }
    };

    flightTimelineRef.current?.kill();
    gsap.killTweensOf(target);
    flightTimelineRef.current = gsap
      .timeline({
        onComplete: () => {
          removeFlight();
          gsap.set(target, { clearProps: "transform" });
        },
      })
      .to(flight, { y: -10, scale: 0.98, duration: 0.16, ease: "power2.out" })
      .to(flight, {
        x: deltaX,
        y: deltaY,
        scale: targetScale * 1.08,
        rotation: -2,
        borderRadius: 24,
        opacity: 0.82,
        duration: 0.64,
        ease: "power3.inOut",
      })
      .to(flight, {
        scale: targetScale * 0.08,
        borderRadius: 999,
        opacity: 0,
        duration: 0.2,
        ease: "none",
      })
      .call(removeFlight)
      .fromTo(
        target,
        { scale: 0.92 },
        { scale: 1.09, duration: 0.18, ease: "power2.out", immediateRender: false },
        "<-=0.16",
      )
      .to(target, { scale: 1, duration: 0.22, ease: "power2.out" });
  }

  function toggleSaved() {
    const surface = saveSurfaceRef.current;
    if (surface) {
      const style = getComputedStyle(surface);
      morphStartRef.current = {
        width: surface.getBoundingClientRect().width,
        radius: Number.parseFloat(style.borderTopLeftRadius) || 0,
      };
    }

    const current = readFairGarage(window.localStorage);
    const next = saved
      ? removeFairGarageModel(current.document, eventId, modelId)
      : addFairGarageModel(current.document, { eventId, modelId, lastKnown });
    const result = writeFairGarage(window.localStorage, next);
    setWriteFailed(!result.ok);
    if (result.ok) {
      window.dispatchEvent(new Event(FAIR_GARAGE_MODEL_CHANGE_EVENT));
      if (!saved) {
        animateToGarage(() => window.dispatchEvent(new Event(FAIR_GARAGE_CHANGE_EVENT)));
      } else {
        window.dispatchEvent(new Event(FAIR_GARAGE_CHANGE_EVENT));
      }
    }
  }

  return (
    <div ref={saveBarRef} className="fair-save-bar">
      <button
        ref={saveButtonRef}
        type="button"
        aria-pressed={saved}
        onClick={toggleSaved}
        className="fair-save-button"
      >
        <span ref={saveSurfaceRef} className="fair-save-button__surface" aria-hidden="true" />
        <span className="fair-save-button__content">
          <CarFront aria-hidden="true" />
          <span>{saved ? savedLabel : saveLabel}</span>
        </span>
      </button>
      {writeFailed ? (
        <p className="fair-save-error" role="alert">
          {errorLabel}
        </p>
      ) : null}
    </div>
  );
}
