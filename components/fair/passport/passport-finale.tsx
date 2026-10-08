"use client";

import Image from "next/image";
import { CarFront } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef } from "react";
import { fairHaptic } from "@/lib/fair-client/haptics";
import { fmt } from "@/lib/i18n/format";
import type { FairPassportDict } from "@/lib/i18n/types";
import styles from "./fair-passport.module.css";
import { PassportSeal, type PassportSealTexts } from "./passport-seal";

const EASE_OUT = "cubic-bezier(.2,.9,.2,1)";
/** Seal delay + the moment its keyframes hit the paper (prototype IMPACT). */
const SEAL_IMPACT_MS = 260 + 385;

/**
 * "Pasoš komplet" ceremony card (port of the prototype `openFinale`): the ink
 * seal stamps in, a wave and dust burst from the impact, then the copy,
 * thumbnails and actions rise in. No rotating rays.
 */
export function PassportFinale({
  brand,
  seal,
  sealLabel,
  thumbs,
  dict,
  onPickFavorite,
  onLater,
}: {
  brand: string;
  seal: PassportSealTexts;
  sealLabel: string;
  thumbs: Array<{ id: string; name: string; photo?: string }>;
  dict: FairPassportDict;
  onPickFavorite: () => void;
  onLater: () => void;
}) {
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);
  const callbacksRef = useRef({ onPickFavorite, onLater });

  useEffect(() => {
    callbacksRef.current = { onPickFavorite, onLater };
  }, [onPickFavorite, onLater]);

  function close(next: "favorite" | "later") {
    const root = rootRef.current;
    if (!root || closingRef.current) return;
    closingRef.current = true;
    const done = () => (next === "favorite" ? callbacksRef.current.onPickFavorite() : callbacksRef.current.onLater());
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      done();
      return;
    }
    root.querySelector('[data-finale="scrim"]')?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, fill: "forwards" });
    root.querySelector('[data-finale="card"]')?.animate([{ opacity: 1 }, { opacity: 0, transform: "translateY(12px)" }], { duration: 220, fill: "forwards" });
    window.setTimeout(done, 260);
  }

  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const part = (name: string) => root.querySelector<HTMLElement>(`[data-finale="${name}"]`);
    const card = part("card")!;
    const sealNode = part("seal")!;
    const primary = part("primary")!;
    const scrim = part("scrim")!;
    const reveal = Array.from(root.querySelectorAll<HTMLElement>("[data-finale-reveal]"));
    const thumbNodes = Array.from(root.querySelectorAll<HTMLElement>("[data-finale-thumb]"));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const html = document.documentElement;
    const previousOverflow = html.style.overflow;
    html.style.overflow = "hidden";
    const timers: number[] = [];

    if (reduced) {
      for (const node of [scrim, card, sealNode, ...reveal]) node.style.opacity = "1";
      primary.focus({ preventScroll: true });
    } else {
      scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, fill: "forwards", easing: "ease" });
      card.animate([{ opacity: 0, transform: "translateY(24px) scale(.96)" }, { opacity: 1, transform: "none" }], { duration: 420, fill: "forwards", easing: EASE_OUT });
      sealNode.animate(
        [
          { opacity: 0, transform: "scale(2.4) rotate(-22deg)" },
          { opacity: 1, transform: "scale(.9) rotate(-6deg)", offset: 0.62 },
          { opacity: 1, transform: "scale(1.03) rotate(-9deg)", offset: 0.82 },
          { opacity: 1, transform: "scale(1) rotate(-8deg)" },
        ],
        { duration: 620, delay: 260, fill: "forwards", easing: "cubic-bezier(.55,0,.4,1)" },
      );
      timers.push(window.setTimeout(() => {
        fairHaptic([70, 40, 150]);
        card.animate([{ transform: "translateY(0)" }, { transform: "translateY(4px) scale(.995)" }, { transform: "translateY(0)" }], { duration: 200 });
        part("wave")?.animate([{ opacity: 0.8, transform: "scale(.9)" }, { opacity: 0, transform: "scale(2.1)" }], { duration: 700, easing: "cubic-bezier(.15,.75,.25,1)" });
        const wrap = part("wrap");
        for (let index = 0; index < 14 && wrap; index += 1) {
          const dust = document.createElement("span");
          dust.className = styles.sealDust;
          wrap.appendChild(dust);
          const angle = (index / 14) * Math.PI * 2 + Math.random() * 0.4;
          const radius = 82 + Math.random() * 34;
          dust.animate(
            [
              { opacity: 0.9, transform: `translate(${Math.cos(angle) * 60}px, ${Math.sin(angle) * 60}px) scale(1)` },
              { opacity: 0, transform: `translate(${Math.cos(angle) * radius}px, ${Math.sin(angle) * radius}px) scale(.3)` },
            ],
            { duration: 560 + Math.random() * 200, easing: "cubic-bezier(.1,.8,.3,1)" },
          ).onfinish = () => dust.remove();
        }
      }, SEAL_IMPACT_MS));
      reveal.forEach((node, index) =>
        node.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 420, delay: 860 + index * 120, fill: "forwards", easing: EASE_OUT }),
      );
      thumbNodes.forEach((node, index) =>
        node.animate(
          [{ transform: "scale(.6)", opacity: 0 }, { transform: "scale(1.08)", opacity: 1, offset: 0.6 }, { transform: "scale(1)", opacity: 1 }],
          { duration: 420, delay: 1000 + index * 110, fill: "backwards", easing: EASE_OUT },
        ),
      );
      timers.push(window.setTimeout(() => primary.focus({ preventScroll: true }), 1400));
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current("later");
        return;
      }
      if (event.key !== "Tab") return;
      const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("button"));
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (!root.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      document.removeEventListener("keydown", onKeyDown);
      html.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div ref={rootRef} className={styles.finale}>
      <div data-finale="scrim" className={styles.finaleScrim} onClick={() => close("later")} aria-hidden="true" />
      <div data-finale="card" className={styles.finaleCard} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div data-finale="wrap" className={styles.sealWrap}>
          <span data-finale="wave" className={styles.sealWave} />
          <div data-finale="seal" className={styles.finaleSeal}>
            <PassportSeal {...seal} label={sealLabel} />
          </div>
        </div>
        <h2 id={titleId} data-finale-reveal className={styles.finaleReveal}>
          {fmt(dict.finaleTitle, { brand })}
        </h2>
        <p data-finale-reveal className={styles.finaleReveal}>{fmt(dict.finaleBody, { brand })}</p>
        <div data-finale-reveal className={`${styles.finaleThumbs} ${styles.finaleReveal}`}>
          {thumbs.map((thumb) => (
            <span key={thumb.id} data-finale-thumb>
              {thumb.photo ? <Image fill sizes="76px" src={thumb.photo} alt={thumb.name} /> : <CarFront aria-label={thumb.name} />}
            </span>
          ))}
        </div>
        <div data-finale-reveal className={`${styles.finaleActions} ${styles.finaleReveal}`}>
          <button type="button" data-finale="primary" onClick={() => close("favorite")}>
            {dict.finalePickFavorite}
          </button>
          <button type="button" onClick={() => close("later")}>
            {dict.finaleLater}
          </button>
        </div>
      </div>
    </div>
  );
}
