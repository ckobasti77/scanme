"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@/components/admin/frame/use-admin-gsap";
import { adminMotion } from "@/components/admin/reveal/gsap-plugins";
import { badgeDef } from "@/lib/admin-v2/game/badges";
import { ceremonyForm, ceremonyParticles, ceremonySeconds, particleTrail, strikeRing } from "@/lib/admin-v2/game/ceremonies";
import { ceremonySignal } from "@/lib/admin-v2/game/ceremony-signal";
import type { RankId, Rarity } from "@/lib/admin-v2/game/ids";
import { BADGE_ART, RANK_ART, type MedalArt } from "@/lib/admin-v2/game/medal-art";
import type { CeremonyEnv, CeremonyItem, CeremonyPlan, CeremonySize } from "@/lib/admin-v2/game/types";
import { ADMIN_CEREMONY, ADMIN_DURATION, ADMIN_EASE, ADMIN_REVEAL_EASE } from "@/lib/admin-v2/motion";
import { quietModeStore } from "@/lib/admin-v2/quiet-mode";
import { isEditableTarget } from "@/lib/admin-v2/shortcuts";
import { pushAdminToast, type AdminToastInput } from "@/lib/admin-v2/toast";
import { fmt } from "@/lib/i18n/format";
import { adminGameSr as d } from "@/lib/i18n/sr/admin-game";
import { useGameApi } from "./game-context";
import { Medal2D } from "./medal-2d";

// ADMIN v3 V5 — the ceremonies (ZADATAK-V3 §4.8): a new level or rank, a beaten
// boss, a badge, a record. A moment over the screen of at most 1.8 s:
//   big  — the whole screen takes part: the live edge is fully lit, the medal flies
//          out of the XP chip and lands with a punch, one ring goes out as it lands,
//          and particles drawn as short trails stream out of the chip behind it and
//          burst from it. The medal is always the 2D one (a WebGL context never
//          starts inside a moment of 1.6 s; the 3D medal lives in the Vitrina), with
//          one sheen that sweeps across it while it holds;
//   card — a card under the navbar beside the chip (a common or rare badge, a
//          record, and everything on a phone).
// It never takes input: the layer has no pointer events and no tab stop, it is
// hidden from a screen reader (one polite sentence announces it instead), and
// any key or click ends it while that key or click still does its own work.
// While focus is in a field or a dialog is open, or the tab is hidden, it is one
// calm toast (also for the second ceremony of a row, which asks again when its
// turn comes); the quiet mode and reduced motion always make it a toast, and a
// record then says nothing.

const OPEN_LAYER = '[role="dialog"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"][data-state="open"]';
/** Below this window width a ceremony is always the card. */
const PHONE_BELOW = 768;

const RANK_RARITY: Record<RankId, Rarity> = { pripravnik: "obicna", operater: "retka", dispecer: "epska", komandant: "epska", legenda: "legendarna" };

export type CeremonyText = { title: string; body: string };

/** What a ceremony says: the same words on the layer, in the toast and to a screen reader. */
export function ceremonyText(item: CeremonyItem): CeremonyText {
  const event = item.event;
  if (event.kind === "level") {
    const rank = d.ranks[event.rank];
    return { title: event.rankUp ? fmt(d.ceremony.rankUp, { rank }) : fmt(d.ceremony.level, { level: event.level }), body: fmt(d.ceremony.levelBody, { rank, level: event.level }) };
  }
  if (event.kind === "boss") return { title: d.ceremony.boss, body: d.ceremony.bossBody };
  if (event.kind === "badge") return { title: fmt(d.ceremony.badge, { name: d.badges[event.badge].name }), body: d.rarity[event.rarity] };
  return { title: d.ceremony.record, body: event.title };
}

/** The medal a ceremony shows. The beaten boss, the biggest moment of the game, has a gold one: the rim and sign of the top rarity on a gold face (the badge itself keeps its own rarity in the Vitrina). */
export function ceremonyMedal(item: CeremonyItem): { art: MedalArt; rarity: Rarity; gold?: true } {
  const event = item.event;
  if (event.kind === "level") return { art: RANK_ART[event.rank], rarity: RANK_RARITY[event.rank] };
  if (event.kind === "boss") return { art: BADGE_ART.sef_je_pao, rarity: "legendarna", gold: true };
  if (event.kind === "badge") return { art: BADGE_ART[event.badge], rarity: event.rarity };
  return { art: BADGE_ART.rekord_sata, rarity: badgeDef("rekord_sata").rarity };
}

export type CeremonyEntry = { item: CeremonyItem; size: CeremonySize };

const isPersonal = (item: CeremonyItem) => item.event.kind !== "record";

/** The environment right now: `hidden` is a tab nobody looks at, where a layer would play to nobody (a calm toast waits for them instead). */
export type CeremonyNow = CeremonyEnv & { hidden?: boolean };

const settled = (now: CeremonyNow): CeremonyEnv => (now.hidden ? { ...now, reducedMotion: true } : now);

/**
 * Where a plan goes right now: over the screen, into a toast, or nowhere. A
 * level, a badge and a beaten boss are information about the operator, so their
 * toast also shows in the quiet mode (`personal`). However much happened at
 * once, a plan is never more than its ceremonies and ONE calm line.
 */
export function ceremonyRoute(plan: CeremonyPlan, now: CeremonyNow): { layer: CeremonyEntry[]; toasts: AdminToastInput[] } {
  const env = settled(now);
  const layer: CeremonyEntry[] = [];
  const calm: CeremonyItem[] = [];
  for (const item of plan.show) {
    const form = ceremonyForm(item, env);
    if (form.as === "layer") layer.push({ item, size: form.size });
    else if (form.as === "toast") calm.push(item);
  }
  // The quiet mode says nothing about a record, also when it is part of what did not fit.
  const rest = plan.rest.filter((item) => ceremonyForm(item, env).as !== "none");
  if (layer.length) {
    return { layer, toasts: rest.length ? [{ key: `more:${rest[0].key}`, title: fmt(d.ceremony.more, { count: rest.length }), body: d.ceremony.moreBody, personal: true }] : [] };
  }
  const all = [...calm, ...rest];
  if (!all.length) return { layer, toasts: [] };
  const [first, ...others] = all;
  const text = ceremonyText(first);
  // Several at once and no ceremony: the most important one is named, the others are counted.
  const body = others.length ? `${fmt(d.ceremony.more, { count: others.length })}. ${d.ceremony.moreBody}` : text.body;
  return { layer, toasts: [{ key: first.key, title: text.title, body, personal: all.some(isPersonal) }] };
}

/**
 * The turn of the next ceremony of a row. The screen may have changed since the plan was made (a field has
 * focus, a dialog is open, the tab is hidden), so each entry asks again: the first one that may still show
 * is returned with what follows it, and every one that may not is a calm toast with the same words (or
 * nothing, for a record in the quiet mode).
 */
export function ceremonyAdvance(queue: readonly CeremonyEntry[], now: CeremonyNow): { show: CeremonyEntry | null; rest: CeremonyEntry[]; toasts: AdminToastInput[] } {
  const toasts: AdminToastInput[] = [];
  for (let at = 0; at < queue.length; at += 1) {
    const { item } = queue[at];
    const form = ceremonyForm(item, settled(now));
    if (form.as === "layer") return { show: { item, size: form.size }, rest: queue.slice(at + 1), toasts };
    if (form.as === "toast") toasts.push({ key: item.key, ...ceremonyText(item), personal: isPersonal(item) });
  }
  return { show: null, rest: [], toasts };
}

function readEnv(): CeremonyNow {
  return {
    quiet: quietModeStore.get(),
    reducedMotion: prefersReducedMotion(),
    editable: isEditableTarget(document.activeElement),
    modal: document.querySelector(OPEN_LAYER) !== null,
    phone: window.innerWidth < PHONE_BELOW,
    hidden: document.visibilityState !== "visible",
  };
}

/** The XP chip that is on the screen now (the navbar has it from lg up). */
function chipRect(): DOMRect | null {
  for (const ring of document.querySelectorAll<HTMLElement>("[data-admin-xp-ring]")) {
    const rect = ring.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return rect;
  }
  return null;
}

export function CeremonyLayer() {
  const { store } = useGameApi();
  const queue = useRef<CeremonyEntry[]>([]);
  const gap = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [current, setCurrent] = useState<(CeremonyEntry & { seq: number }) | null>(null);
  const [announce, setAnnounce] = useState("");
  const seq = useRef(0);
  const playing = useRef(false);
  /** Ceremonies shown since the screen was last free of them: at most two in a row. */
  const row = useRef(0);

  const next = useCallback(() => {
    // The screen is read again at the turn of each ceremony, not only when the plan arrived.
    const turn = ceremonyAdvance(queue.current, readEnv());
    queue.current = turn.rest;
    for (const toast of turn.toasts) pushAdminToast(toast);
    const entry = turn.show;
    if (!entry) {
      playing.current = false;
      row.current = 0;
      setCurrent(null);
      return;
    }
    playing.current = true;
    const text = ceremonyText(entry.item);
    setAnnounce(`${text.title}. ${text.body}`);
    setCurrent({ ...entry, seq: ++seq.current });
  }, []);

  const end = useCallback(() => {
    // The one after it starts after a short pause.
    setCurrent(null);
    if (!queue.current.length) {
      playing.current = false;
      row.current = 0;
      return;
    }
    gap.current = setTimeout(next, ADMIN_CEREMONY.gap * 1000);
  }, [next]);

  const skip = useCallback(() => {
    queue.current = [];
    if (gap.current) clearTimeout(gap.current);
    gap.current = null;
    playing.current = false;
    row.current = 0;
    setCurrent(null);
  }, []);

  useEffect(
    () =>
      store.onEffect((effect) => {
        if (effect.type !== "ceremony") return;
        const route = ceremonyRoute(effect.plan, readEnv());
        // Two ceremonies in a row at most, also when they come from separate steps: the rest is one calm line each.
        const room = Math.max(0, ADMIN_CEREMONY.maxInRow - row.current);
        const shown = route.layer.slice(0, room);
        row.current += shown.length;
        for (const toast of route.toasts) pushAdminToast(toast);
        for (const entry of route.layer.slice(room)) pushAdminToast({ key: entry.item.key, ...ceremonyText(entry.item), personal: isPersonal(entry.item) });
        if (!shown.length) return;
        queue.current.push(...shown);
        if (!playing.current) next();
      }),
    [store, next],
  );

  // Any key or click ends the ceremony; the event is not stopped, so it also does what it was meant to do.
  const active = current !== null;
  useEffect(() => {
    if (!active) return;
    window.addEventListener("keydown", skip, true);
    window.addEventListener("pointerdown", skip, true);
    return () => {
      window.removeEventListener("keydown", skip, true);
      window.removeEventListener("pointerdown", skip, true);
    };
  }, [active, skip]);
  useEffect(
    () => () => {
      if (gap.current) clearTimeout(gap.current);
    },
    [],
  );
  return (
    <>
      <p role="status" aria-live="polite" aria-label={d.ceremony.region} data-ceremony-announce="" className="sr-only">{announce}</p>
      {current ? <CeremonyStage key={current.seq} entry={current} onDone={end} /> : null}
    </>
  );
}

/** One ceremony on the screen. Decoration only: nothing in it can be focused, clicked or read by a screen reader. */
export function CeremonyStage({ entry, onDone }: { entry: CeremonyEntry; onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const done = useRef(onDone);
  const text = ceremonyText(entry.item);
  const medal = ceremonyMedal(entry.item);
  const big = entry.size === "big";

  useEffect(() => {
    done.current = onDone;
  });

  // The screen knows a ceremony is on it: decoration steps aside (the aim line of the Dashboard), and a big one
  // lights the live edge of the frame. Taken back at the end, on a skip and on unmount.
  useLayoutEffect(() => {
    const frame = root.current?.closest<HTMLElement>(".admin-v1") ?? null;
    ceremonySignal.set(entry.size);
    if (big) frame?.setAttribute("data-admin-celebrating", "");
    return () => {
      frame?.removeAttribute("data-admin-celebrating");
      ceremonySignal.set(null);
    };
  }, [entry.size, big]);

  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const { gsap } = adminMotion();
    const time = ceremonySeconds(entry.size);
    const body = element.querySelector<HTMLElement>("[data-ceremony-body]");
    const words = element.querySelector<HTMLElement>("[data-ceremony-words]");
    const shade = element.querySelector<HTMLElement>("[data-ceremony-shade]");
    const sheen = element.querySelector<HTMLElement>("[data-ceremony-sheen]");
    if (!body) return;
    // Measured at rest: a run of this effect that was cut short (React runs it twice in development) leaves nothing behind.
    gsap.set([body, words, shade, sheen].filter(Boolean), { clearProps: "transform,opacity" });
    const box = body.getBoundingClientRect();
    const chip = chipRect();
    // It leaves the XP chip and returns to it; without a chip on the screen it comes from above.
    const back = chip
      ? { x: chip.left + chip.width / 2 - (box.left + box.width / 2), y: chip.top + chip.height / 2 - (box.top + box.height / 2), scale: Math.max(0.12, chip.width / box.width) }
      : { x: 0, y: -24, scale: 0.8 };
    // The big medal comes out of the chip already at 0.4 and lands with a punch; the card grows from the chip.
    const enter = big ? { ...back, scale: ADMIN_CEREMONY.medal.from } : back;
    const leave = time.in + time.hold;

    const particles = ceremonyParticles(entry.size, entry.item.key.length * 7919 + entry.item.event.at % 9973);
    const context = canvas.current?.getContext("2d") ?? null;
    const style = getComputedStyle(element);
    // The green of energy, gold and silver: all three read on a light and on a dark screen.
    const colors = ["--admin-nav-line", "--admin-medal-1", "--admin-medal-2"].map((name) => style.getPropertyValue(name).trim() || "#6fc05d");
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = window.innerWidth;
    const height = window.innerHeight;
    if (canvas.current) {
      canvas.current.width = Math.round(width * ratio);
      canvas.current.height = Math.round(height * ratio);
    }
    const reach = Math.min(width, height);
    const origin = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    // A particle is born where the medal is at that moment (the chip, then on its way, then the centre), and flies from there.
    const anchors: Array<{ x: number; y: number } | undefined> = [];
    const draw = () => {
      if (!context) return;
      const seconds = timeline.time();
      const progress = seconds / time.total;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      context.lineCap = "round";
      const live = { x: origin.x + Number(gsap.getProperty(body, "x")), y: origin.y + Number(gsap.getProperty(body, "y")) };
      for (let index = 0; index < particles.length; index += 1) {
        const particle = particles[index];
        const trail = particleTrail(particle, progress);
        if (!trail) continue;
        const anchor = (anchors[index] ??= live);
        context.globalAlpha = trail.alpha;
        context.strokeStyle = colors[Math.min(colors.length - 1, Math.floor(particle.hue * colors.length))];
        context.lineWidth = trail.width;
        context.beginPath();
        context.moveTo(anchor.x + trail.from.x * reach, anchor.y + trail.from.y * reach);
        context.lineTo(anchor.x + trail.to.x * reach, anchor.y + trail.to.y * reach);
        context.stroke();
      }
      // The one ring of the strike goes out from the centre of the medal as it lands.
      const ring = big ? strikeRing(seconds - time.in) : null;
      if (ring) {
        context.globalAlpha = ring.alpha;
        context.strokeStyle = colors[0];
        context.lineWidth = ring.width;
        context.beginPath();
        context.arc(origin.x, origin.y, ring.radius * reach, 0, Math.PI * 2);
        context.stroke();
      }
      context.globalAlpha = 1;
    };

    const timeline = gsap.timeline({ onUpdate: draw, onComplete: () => done.current() });
    if (shade) timeline.fromTo(shade, { opacity: 0 }, { opacity: 1, duration: time.in, ease: ADMIN_EASE.out }, 0).to(shade, { opacity: 0, duration: time.out, ease: ADMIN_EASE.in }, leave);
    timeline.fromTo(body, { x: enter.x, y: enter.y, opacity: 0.2 }, { x: 0, y: 0, opacity: 1, duration: time.in, ease: ADMIN_REVEAL_EASE.out }, 0);
    if (big) {
      // Up to a little past 1 on the curve of the spark, then settled onto 1: it lands once, it does not bounce.
      timeline.fromTo(body, { scale: enter.scale }, { scale: ADMIN_CEREMONY.medal.over, duration: time.in, ease: ADMIN_REVEAL_EASE.ignite }, 0).to(body, { scale: 1, duration: ADMIN_DURATION.feedback, ease: ADMIN_EASE.out }, time.in);
    } else {
      timeline.fromTo(body, { scale: enter.scale }, { scale: 1, duration: time.in, ease: ADMIN_REVEAL_EASE.out }, 0);
    }
    timeline.to(body, { x: back.x, y: back.y, scale: back.scale, opacity: 0, duration: time.out, ease: ADMIN_EASE.in }, leave);
    // One sheen sweeps across the medal while it holds (clipped to its circle by its box; transform only).
    if (sheen) timeline.fromTo(sheen, { xPercent: 0, skewX: -18 }, { xPercent: 420, skewX: -18, duration: time.hold * 0.55, ease: ADMIN_EASE.in }, time.in + ADMIN_DURATION.feedback);
    if (words) timeline.fromTo(words, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: ADMIN_CEREMONY.words.in, ease: ADMIN_EASE.out }, time.in * 0.5).to(words, { opacity: 0, duration: ADMIN_CEREMONY.words.out, ease: ADMIN_EASE.in }, leave);
    // The whole moment has one fixed length, whatever its parts add up to.
    timeline.set({}, {}, time.total);
    return () => {
      timeline.kill();
    };
  }, [entry, big]);

  return (
    <div ref={root} data-admin-ceremony={entry.size} data-ceremony-kind={entry.item.event.kind} aria-hidden="true" className="pointer-events-none fixed inset-0 z-[70] overflow-hidden">
      {big ? <div data-ceremony-shade="" className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,transparent_0,color-mix(in_oklab,var(--admin-app)_82%,transparent)_62%)] opacity-0" /> : null}
      <canvas ref={canvas} className="absolute inset-0 size-full" />
      {big ? (
        <div className="absolute inset-0 grid place-content-center justify-items-center gap-5 pb-[10vh]">
          <div data-ceremony-body="" className="size-44 rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] p-2 opacity-0 shadow-[var(--admin-shadow-lg)]">
            <div className="relative size-full">
              <Medal2D art={medal.art} rarity={medal.rarity} gold={medal.gold} className="size-full" />
              {/* The face of the medal is its box inset by 7 %; the band runs from outside its left edge to outside its right one. */}
              <span aria-hidden="true" className="absolute inset-[7%] overflow-hidden rounded-full">
                <span data-ceremony-sheen="" className="absolute inset-y-[-12%] -left-1/3 w-1/3" style={{ background: "linear-gradient(90deg, transparent, rgb(255 255 255 / 0.62), transparent)" }} />
              </span>
            </div>
          </div>
          <div data-ceremony-words="" className="max-w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-5 py-3 text-center opacity-0 shadow-[var(--admin-shadow-md)]">
            <p className="text-xl leading-7 font-semibold tracking-[-0.02em]">{text.title}</p>
            <p className="mt-0.5 text-sm text-[var(--admin-text-muted)]">{text.body}</p>
            <p className="mt-1.5 text-[0.68rem] text-[var(--admin-text-muted)]">{d.ceremony.skipHint}</p>
          </div>
        </div>
      ) : (
        <div data-ceremony-body="" className="absolute top-[calc(var(--admin-navbar-h)+0.75rem)] right-4 flex h-24 w-[min(17.5rem,calc(100vw-2rem))] origin-top-right items-center gap-3 rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-4 opacity-0 shadow-[var(--admin-shadow-lg)]">
          <Medal2D art={medal.art} rarity={medal.rarity} gold={medal.gold} className="size-14 flex-none" />
          <div className="min-w-0">
            <p className="text-sm leading-5 font-semibold [overflow-wrap:anywhere]">{text.title}</p>
            <p className="mt-0.5 line-clamp-2 text-xs leading-4 text-[var(--admin-text-muted)]">{text.body}</p>
          </div>
        </div>
      )}
    </div>
  );
}
