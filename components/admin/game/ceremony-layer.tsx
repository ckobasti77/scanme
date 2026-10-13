"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@/components/admin/frame/use-admin-gsap";
import { adminMotion } from "@/components/admin/reveal/gsap-plugins";
import { badgeDef } from "@/lib/admin-v2/game/badges";
import { ceremonyForm, ceremonyParticles, ceremonySeconds, particleAt } from "@/lib/admin-v2/game/ceremonies";
import type { RankId, Rarity } from "@/lib/admin-v2/game/ids";
import { BADGE_ART, RANK_ART, type MedalArt } from "@/lib/admin-v2/game/medal-art";
import type { CeremonyEnv, CeremonyItem, CeremonyPlan, CeremonySize } from "@/lib/admin-v2/game/types";
import { ADMIN_CEREMONY, ADMIN_EASE, ADMIN_REVEAL_EASE } from "@/lib/admin-v2/motion";
import { quietModeStore } from "@/lib/admin-v2/quiet-mode";
import { isEditableTarget } from "@/lib/admin-v2/shortcuts";
import { pushAdminToast, type AdminToastInput } from "@/lib/admin-v2/toast";
import { fmt } from "@/lib/i18n/format";
import { adminGameSr as d } from "@/lib/i18n/sr/admin-game";
import { useGameApi } from "./game-context";
import { Medal2D } from "./medal-2d";
import { MedalStage, medalSceneReady, warmMedalScene } from "./medal-stage";

// ADMIN v3 V4 — the ceremonies (ZADATAK-V3 §4.8): a new level or rank, a beaten
// boss, a badge, a record. A moment over the screen of at most 1.8 s:
//   big  — the medal flies out of the XP chip to the centre, with particles;
//   card — a card under the navbar beside the chip (a common or rare badge, a
//          record, and everything on a phone).
// It never takes input: the layer has no pointer events and no tab stop, it is
// hidden from a screen reader (one polite sentence announces it instead), and
// any key or click ends it while that key or click still does its own work.
// While focus is in a field or a dialog is open it is one calm toast; the quiet
// mode and reduced motion always make it a toast, and a record then says nothing.

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

/** The medal a ceremony shows. */
export function ceremonyMedal(item: CeremonyItem): { art: MedalArt; rarity: Rarity } {
  const event = item.event;
  if (event.kind === "level") return { art: RANK_ART[event.rank], rarity: RANK_RARITY[event.rank] };
  if (event.kind === "boss") return { art: BADGE_ART.sef_je_pao, rarity: badgeDef("sef_je_pao").rarity };
  if (event.kind === "badge") return { art: BADGE_ART[event.badge], rarity: event.rarity };
  return { art: BADGE_ART.rekord_sata, rarity: badgeDef("rekord_sata").rarity };
}

export type CeremonyEntry = { item: CeremonyItem; size: CeremonySize };

const isPersonal = (item: CeremonyItem) => item.event.kind !== "record";

/**
 * Where a plan goes right now: over the screen, into a toast, or nowhere. A
 * level, a badge and a beaten boss are information about the operator, so their
 * toast also shows in the quiet mode (`personal`). However much happened at
 * once, a plan is never more than its ceremonies and ONE calm line.
 */
export function ceremonyRoute(plan: CeremonyPlan, env: CeremonyEnv): { layer: CeremonyEntry[]; toasts: AdminToastInput[] } {
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

function readEnv(): CeremonyEnv {
  return {
    quiet: quietModeStore.get(),
    reducedMotion: prefersReducedMotion(),
    editable: isEditableTarget(document.activeElement),
    modal: document.querySelector(OPEN_LAYER) !== null,
    phone: window.innerWidth < PHONE_BELOW,
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
    const entry = queue.current.shift();
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
  // On a page with a scene of its own the medal scene follows the kit, so a ceremony finds it there.
  useEffect(() => warmMedalScene(), []);

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
  // A 3D medal only where its scene is already in this tab: a moment of 1.6 s never waits for the network.
  const [solid] = useState(() => big && typeof window !== "undefined" && medalSceneReady());

  useEffect(() => {
    done.current = onDone;
  });

  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const { gsap } = adminMotion();
    const time = ceremonySeconds(entry.size);
    const body = element.querySelector<HTMLElement>("[data-ceremony-body]");
    const words = element.querySelector<HTMLElement>("[data-ceremony-words]");
    const shade = element.querySelector<HTMLElement>("[data-ceremony-shade]");
    if (!body) return;
    // Measured at rest: a run of this effect that was cut short (React runs it twice in development) leaves nothing behind.
    gsap.set([body, words, shade].filter(Boolean), { clearProps: "transform,opacity" });
    const box = body.getBoundingClientRect();
    const chip = chipRect();
    // It leaves the XP chip and returns to it; without a chip on the screen it comes from above.
    const from = chip
      ? { x: chip.left + chip.width / 2 - (box.left + box.width / 2), y: chip.top + chip.height / 2 - (box.top + box.height / 2), scale: Math.max(0.12, chip.width / box.width) }
      : { x: 0, y: -24, scale: 0.8 };
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
    const draw = (progress: number) => {
      if (!context) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      for (const particle of particles) {
        const at = particleAt(particle, progress);
        if (at.alpha <= 0) continue;
        context.globalAlpha = at.alpha;
        context.fillStyle = colors[Math.min(colors.length - 1, Math.floor(particle.hue * colors.length))];
        context.beginPath();
        context.arc(origin.x + at.x * reach, origin.y + at.y * reach, particle.size * at.scale, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
    };

    const timeline = gsap.timeline({ onUpdate: () => draw(timeline.time() / time.total), onComplete: () => done.current() });
    if (shade) timeline.fromTo(shade, { opacity: 0 }, { opacity: 1, duration: time.in, ease: ADMIN_EASE.out }, 0).to(shade, { opacity: 0, duration: time.out, ease: ADMIN_EASE.in }, leave);
    timeline
      .fromTo(body, { x: from.x, y: from.y, scale: from.scale, opacity: 0.2 }, { x: 0, y: 0, scale: 1, opacity: 1, duration: time.in, ease: ADMIN_REVEAL_EASE.out }, 0)
      .to(body, { x: from.x, y: from.y, scale: from.scale, opacity: 0, duration: time.out, ease: ADMIN_EASE.in }, leave);
    if (words) timeline.fromTo(words, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.2, ease: ADMIN_EASE.out }, time.in * 0.5).to(words, { opacity: 0, duration: 0.16, ease: ADMIN_EASE.in }, leave);
    // The whole moment has one fixed length, whatever its parts add up to.
    timeline.set({}, {}, time.total);
    return () => {
      timeline.kill();
    };
  }, [entry]);

  return (
    <div ref={root} data-admin-ceremony={entry.size} data-ceremony-kind={entry.item.event.kind} aria-hidden="true" className="pointer-events-none fixed inset-0 z-[70] overflow-hidden">
      {big ? <div data-ceremony-shade="" className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,transparent_0,color-mix(in_oklab,var(--admin-app)_82%,transparent)_62%)] opacity-0" /> : null}
      <canvas ref={canvas} className="absolute inset-0 size-full" />
      {big ? (
        <div className="absolute inset-0 grid place-content-center justify-items-center gap-5 pb-[10vh]">
          <div data-ceremony-body="" className="size-44 rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] p-2 opacity-0 shadow-[var(--admin-shadow-lg)]">
            {solid ? <MedalStage art={medal.art} rarity={medal.rarity} mode="ceremony" className="size-full" /> : <Medal2D art={medal.art} rarity={medal.rarity} className="size-full" />}
          </div>
          <div data-ceremony-words="" className="max-w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-5 py-3 text-center opacity-0 shadow-[var(--admin-shadow-md)]">
            <p className="text-xl leading-7 font-semibold tracking-[-0.02em]">{text.title}</p>
            <p className="mt-0.5 text-sm text-[var(--admin-text-muted)]">{text.body}</p>
            <p className="mt-1.5 text-[0.68rem] text-[var(--admin-text-muted)]">{d.ceremony.skipHint}</p>
          </div>
        </div>
      ) : (
        <div data-ceremony-body="" className="absolute top-[calc(var(--admin-navbar-h)+0.75rem)] right-4 flex h-24 w-[min(17.5rem,calc(100vw-2rem))] origin-top-right items-center gap-3 rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-4 opacity-0 shadow-[var(--admin-shadow-lg)]">
          <Medal2D art={medal.art} rarity={medal.rarity} className="size-14 flex-none" />
          <div className="min-w-0">
            <p className="text-sm leading-5 font-semibold [overflow-wrap:anywhere]">{text.title}</p>
            <p className="mt-0.5 line-clamp-2 text-xs leading-4 text-[var(--admin-text-muted)]">{text.body}</p>
          </div>
        </div>
      )}
    </div>
  );
}
