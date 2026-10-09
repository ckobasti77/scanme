"use client";

import gsap from "gsap";
import Link from "next/link";
import { CarFront, Check, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  FAIR_GARAGE_CHANGE_EVENT,
  FAIR_GARAGE_MODEL_CHANGE_EVENT,
  addFairGarageModel,
  hasFairGarageModel,
  readFairGarage,
  removeFairGarageModel,
  writeFairGarage,
  type FairGarageLastKnownModel,
} from "@/lib/fair-client/garage-store";
import { fairGarageEventCount } from "@/lib/fair-client/garage-view";
import { fairHaptic } from "@/lib/fair-client/haptics";
import { fmt } from "@/lib/i18n";

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

const garageCountCache = new Map<string, number>();

function getGarageCount(eventId: string, eventSlug: string) {
  const count = fairGarageEventCount(readFairGarage(window.localStorage).document, { eventId, eventSlug });
  garageCountCache.set(`${eventId}|${eventSlug}`, count);
  return count;
}

function getCachedGarageCount(eventId: string, eventSlug: string) {
  if (typeof window === "undefined") return null;
  return garageCountCache.get(`${eventId}|${eventSlug}`) ?? null;
}

function hasModel(eventId: string, modelId: string) {
  return hasFairGarageModel(readFairGarage(window.localStorage).document, eventId, modelId);
}

export function GarageBadge({
  eventId,
  eventSlug,
  ariaTemplate,
}: {
  eventId: string;
  eventSlug: string;
  ariaTemplate: string;
}) {
  const count = useSyncExternalStore(
    subscribeGarageBadge,
    () => getGarageCount(eventId, eventSlug),
    () => getCachedGarageCount(eventId, eventSlug),
  );
  const badgeRef = useRef<HTMLSpanElement>(null);
  const previousCount = useRef(count);

  // The count changed (saved or removed, not the first read): the badge pops.
  useEffect(() => {
    const previous = previousCount.current;
    previousCount.current = count;
    if (previous === null || count === null || previous === count) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    badgeRef.current?.animate([{ transform: "scale(.4)" }, { transform: "scale(1)" }], {
      duration: 450,
      easing: "cubic-bezier(.3,1.6,.5,1)",
    });
  }, [count]);

  return (
    <span
      ref={badgeRef}
      className="fair-garage-badge"
      data-ready={count !== null}
      aria-label={count === null ? undefined : fmt(ariaTemplate, { count })}
    >
      <span className="fair-garage-badge__value" aria-hidden="true" suppressHydrationWarning>
        {count ?? ""}
      </span>
    </span>
  );
}

/**
 * Model page v2 save dock: blue "Sačuvaj u garažu"; once saved a white pill
 * with a check badge ("U garaži", tap removes) and "Otvori garažu ›". Saving
 * flies the hero photo into the garage icon, then the badge pops.
 */
export function GarageSaveButton({
  eventId,
  modelId,
  lastKnown,
  saveLabel,
  savedLabel,
  openGarageLabel,
  garageHref,
  errorLabel,
}: {
  eventId: string;
  modelId: string;
  lastKnown: FairGarageLastKnownModel;
  saveLabel: string;
  savedLabel: string;
  openGarageLabel: string;
  garageHref: string;
  errorLabel: string;
}) {
  const [writeFailed, setWriteFailed] = useState(false);
  const flightTimelineRef = useRef<gsap.core.Timeline | null>(null);
  const flightElementRef = useRef<HTMLImageElement | null>(null);
  const saved = useSyncExternalStore(
    subscribeGarageModel,
    () => hasModel(eventId, modelId),
    () => false,
  );

  useEffect(() => {
    return () => {
      flightTimelineRef.current?.kill();
      flightElementRef.current?.remove();
    };
  }, []);

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
    const current = readFairGarage(window.localStorage);
    const next = saved
      ? removeFairGarageModel(current.document, eventId, modelId)
      : addFairGarageModel(current.document, { eventId, modelId, lastKnown });
    const result = writeFairGarage(window.localStorage, next);
    setWriteFailed(!result.ok);
    if (result.ok) {
      window.dispatchEvent(new Event(FAIR_GARAGE_MODEL_CHANGE_EVENT));
      if (!saved) {
        animateToGarage(() => {
          fairHaptic([18, 40, 28]);
          window.dispatchEvent(new Event(FAIR_GARAGE_CHANGE_EVENT));
        });
      } else {
        window.dispatchEvent(new Event(FAIR_GARAGE_CHANGE_EVENT));
      }
    }
  }

  return (
    <div className="fair-save-bar">
      <div className="fair-save-dock" data-saved={saved}>
        <button type="button" aria-pressed={saved} onClick={toggleSaved} className="fair-save-button">
          {saved ? (
            <>
              <span className="fair-save-button__check" aria-hidden="true">
                <Check />
              </span>
              <span>{savedLabel}</span>
            </>
          ) : (
            <>
              <CarFront aria-hidden="true" />
              <span>{saveLabel}</span>
            </>
          )}
        </button>
        {saved ? (
          <Link className="fair-save-open" href={garageHref}>
            {openGarageLabel}
            <ChevronRight aria-hidden="true" />
          </Link>
        ) : null}
      </div>
      {writeFailed ? (
        <p className="fair-save-error" role="alert">
          {errorLabel}
        </p>
      ) : null}
    </div>
  );
}
