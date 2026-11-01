"use client";

import { inRevealWindow, isLiveRow, lateReveal, type RevealMode } from "@/lib/admin-v2/reveal/gate";
import {
  DRAW_REGISTRY,
  REVEAL_REGISTRY,
  countFrame,
  fitStagger,
  groupSchedule,
  isCountable,
  isDrawKind,
  isRevealKind,
  revealBudget,
  revealDuration,
  revealRowsMax,
  revealSchedule,
  waveDelays,
  type DrawKind,
  type RevealKind,
} from "@/lib/admin-v2/reveal/registry";
import { ADMIN_DURATION, ADMIN_EASE, ADMIN_REVEAL, ADMIN_REVEAL_EASE } from "@/lib/admin-v2/motion";
import { adminMotion } from "./gsap-plugins";

// ADMIN v3 V1 — the reveal engine (ZADATAK-V3 §2; plan §2.3–§2.7). One visit
// of a page: the engine reads the nodes the page marked (`data-admin-reveal`,
// `data-admin-draw`), measures them in one batch, hides what will enter and
// plays the entrance in the order of the scan line. Below the fold a
// ScrollTrigger on the screen of the frame reveals the rest once. Content that
// arrives while the entrance window is open gets its choreography; after it
// only a replaced skeleton fades in and a live row enters, so polling and
// filtering never repeat the entrance. Everything lives in one gsap.context
// and is reverted when the page changes; `clearProps` leaves nothing on an
// element. The hidden start state is set here, by JavaScript, after the gate:
// without it nothing is ever hidden.
// V5 (RV S1, S5): a read that arrives after the window still gets its own
// choreography, once per place of the page (the real admin waits for its
// queries; a filter and polling still never repeat an entrance). An error
// anywhere in a visit ends the visit with everything in its final state, and
// what waits below the fold is let go by a fuse and when the page is printed.

type Timeline = gsap.core.Timeline;

type Found = {
  element: HTMLElement | SVGElement;
  kind: RevealKind | DrawKind;
  top: number;
  left: number;
  /** `rows`: the children that enter one by one, each with its own place. */
  rows?: { element: HTMLElement; top: number; left: number }[];
  /** `title`: where each line stands inside the title block. */
  lines?: { element: HTMLElement; left: number; top: number; width: number }[];
};

export type VisitInput = {
  /** `main[data-admin-frame="screen"]`: the scroller of the admin. */
  screen: HTMLElement;
  /** `[data-admin-page]`: the content of the page. */
  page: HTMLElement;
  /** The scan line (a child of an `overflow: hidden` layer over the screen). */
  scanLine: HTMLElement | null;
  mode: RevealMode;
  /** false: nothing may move at all (reduced motion, the quiet mode, a hidden tab). */
  watch: boolean;
  /** The frame was just mounted: there is no old page to fade from. */
  first: boolean;
  phone: boolean;
  /** The full entrance has ended: the visit is written to the log. */
  onFull: () => void;
};

const SKIP = "[data-admin-reveal-ghost], [data-admin-title-ghosts]";
const NODES = "[data-admin-reveal], [data-admin-draw]";
const SKELETON = '[data-admin-primitive="loading"]';
/** A node inside one of these enters with it, not on its own. */
const HOSTS = '[data-admin-reveal="card"], [data-admin-reveal="chart"], [data-admin-reveal="kpi"], [data-admin-reveal="rows"]';
const FADE = 0.18;

const isElement = (node: Node): node is HTMLElement => node.nodeType === 1;
const kindOf = (element: Element): RevealKind | DrawKind | null => {
  const reveal = element.getAttribute("data-admin-reveal");
  if (isRevealKind(reveal)) return reveal;
  const draw = element.getAttribute("data-admin-draw");
  return isDrawKind(draw) ? draw : null;
};

/** The one text node of an element that holds its number (React keeps the node, so only its value is written). */
function countNode(element: Element): Text | null {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let found: Text | null = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!/\d/.test(node.nodeValue ?? "")) continue;
    if (found) return null;
    found = node as Text;
  }
  return found && isCountable(found.nodeValue ?? "") ? found : null;
}

export function startVisit(input: VisitInput): () => void {
  const { screen, page, scanLine, mode, phone } = input;
  const { gsap, ScrollTrigger, SplitText } = adminMotion();
  const cleanups: (() => void)[] = [];
  const context = gsap.context(() => undefined);
  const finish = () => {
    for (const cleanup of cleanups.splice(0)) {
      try {
        cleanup();
      } catch {
        // One cleanup that fails must not keep the others from running.
      }
    }
    context.revert();
  };
  /** An animation must never take the page down (ZADATAK-V3 §0): the visit ends, everything is in its final state. */
  let failed = false;
  const fail = () => {
    if (failed) return;
    failed = true;
    try {
      finish();
      gsap.set(page, { clearProps: "opacity,transform" });
    } catch {
      // Nothing more to take back.
    }
  };
  const guard = (run: () => void) => {
    if (failed) return;
    try {
      run();
    } catch {
      fail();
    }
  };

  // The old page was dimmed by the click that left it: the new one starts clean.
  gsap.killTweensOf(page);
  gsap.set(page, { clearProps: "opacity,transform" });

  if (!input.watch) {
    // Reduced motion, the quiet mode: nothing moves, a new page only fades in (v2).
    if (!input.first) context.add(() => gsap.fromTo(page, { opacity: 0 }, { opacity: 1, duration: ADMIN_DURATION.move, ease: ADMIN_EASE.out, clearProps: "opacity" }));
    return finish;
  }

  const enteredAt = performance.now();
  const seen = new WeakSet<Element>();
  const ids = new Set<string>();
  const rowLists = new WeakSet<Element>();
  /** Rows whose cascade may still be running, by their list, with the tweens that move them. */
  const cascades = new Map<Element, { rows: HTMLElement[]; tweens: gsap.core.Tween[] }>();
  /** Places of the page whose skeleton was already replaced in this visit. */
  const regions = new WeakSet<Element>();
  const options = { mode: mode === "short" ? ("short" as const) : ("full" as const), phone };
  const budget = revealBudget(options);
  const still = mode === "none";

  // ---------------------------------------------------------------------------
  // Read: which nodes enter and where they stand (one batch of reads)
  // ---------------------------------------------------------------------------

  function find(roots: readonly Element[]): Found[] {
    const candidates = new Set<Element>();
    for (const root of roots) {
      if (root.matches(NODES)) candidates.add(root);
      for (const element of root.querySelectorAll(NODES)) candidates.add(element);
    }
    const origin = screen.getBoundingClientRect();
    const found: Found[] = [];
    for (const element of candidates) {
      if (seen.has(element)) continue;
      seen.add(element);
      const kind = kindOf(element);
      if (!kind || element.closest(SKIP)) continue;
      const id = element.getAttribute("data-admin-reveal-id");
      if (id) {
        if (ids.has(id)) continue;
        ids.add(id);
      }
      const host = element.parentElement?.closest(HOSTS) ?? null;
      const inside = host !== null && page.contains(host);
      if (kind === "card" || kind === "chart" || kind === "text" || kind === "media" || kind === "title") {
        if (inside) continue;
        // A panel that still shows its skeleton stands at once, with the shimmer.
        if ((kind === "card" || kind === "chart") && element.querySelector(SKELETON)) continue;
      }
      // The steps of a funnel own their bars; a returning page draws no chart again.
      if (isDrawKind(kind) && (element.parentElement?.closest('[data-admin-draw="funnel"]') || mode === "short")) continue;
      const box = element.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) {
        // Hidden (the other view of a list, a closed <details>): its rows are known, nothing enters.
        if (kind === "rows") {
          rowLists.add(element);
          for (const child of element.children) seen.add(child);
        }
        continue;
      }
      const node: Found = { element: element as HTMLElement, kind, top: box.top - origin.top, left: box.left - origin.left };
      if (kind === "rows") {
        rowLists.add(element);
        node.rows = [];
        for (const child of element.children) {
          seen.add(child);
          if (node.rows.length >= revealRowsMax(phone) || !(child instanceof HTMLElement) || child.matches(SKIP)) continue;
          const rect = child.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) continue;
          node.rows.push({ element: child, top: rect.top - origin.top, left: rect.left - origin.left });
        }
      }
      if (kind === "title") {
        node.lines = [...element.querySelectorAll<HTMLElement>("[data-admin-title-line]")].map((line) => ({ element: line, left: line.offsetLeft, top: line.offsetTop, width: line.offsetWidth }));
      }
      found.push(node);
    }
    return found;
  }

  /** After the entrance: what arrived is only written down as seen. No layout is read and nothing enters. */
  function note(roots: readonly Element[]): void {
    for (const root of roots) {
      const nodes = [...root.querySelectorAll(NODES)];
      if (root.matches(NODES)) nodes.unshift(root);
      for (const element of nodes) {
        if (seen.has(element)) continue;
        seen.add(element);
        const id = element.getAttribute("data-admin-reveal-id");
        if (id) ids.add(id);
        if (element.getAttribute("data-admin-reveal") !== "rows") continue;
        rowLists.add(element);
        for (const child of element.children) seen.add(child);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Write: the tweens of one node inside a timeline
  // ---------------------------------------------------------------------------

  /** A title: a temporary copy of every line is split (SplitText) and its lines rise out of their masks. */
  function title(node: Found, timeline: Timeline, start: number, duration: number, available: number) {
    const layer = node.element.querySelector<HTMLElement>("[data-admin-title-ghosts]");
    const lines = node.lines ?? [];
    if (!layer || !lines.length) {
      timeline.fromTo(lines.length ? lines.map((line) => line.element) : node.element, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration, ease: ADMIN_REVEAL_EASE.out, clearProps: "opacity,transform" }, start);
      return;
    }
    const fontsReady = typeof document.fonts === "undefined" || document.fonts.status === "loaded";
    const ghosts: HTMLElement[] = [];
    const splits: { revert(): void }[] = [];
    let done = false;
    let watcher: MutationObserver | null = null;
    const end = () => {
      if (done) return;
      done = true;
      watcher?.disconnect();
      for (const split of splits) split.revert();
      for (const ghost of ghosts) ghost.remove();
      for (const line of lines) line.element.style.removeProperty("visibility");
    };
    // Known to the visit before the first line is hidden: whatever throws below, the real title comes back.
    cleanups.push(end);
    // The real title changed while its copy was on the screen (a profile got its name): show the real one at once.
    watcher = new MutationObserver((records) => {
      if (records.some((record) => !layer.contains(record.target))) end();
    });
    lines.forEach((line, index) => {
      const ghost = line.element.cloneNode(true) as HTMLElement;
      for (const attribute of ["id", "data-admin-title-line"]) ghost.removeAttribute(attribute);
      for (const child of ghost.querySelectorAll("[id]")) child.removeAttribute("id");
      ghost.setAttribute("aria-hidden", "true");
      ghost.setAttribute("data-admin-reveal-ghost", "");
      Object.assign(ghost.style, { position: "absolute", left: `${line.left}px`, top: `${line.top}px`, width: `${line.width}px`, margin: "0" });
      layer.append(ghost);
      ghosts.push(ghost);
      line.element.style.visibility = "hidden";
      const at = start + index * ADMIN_REVEAL.titleStagger * (duration / ADMIN_REVEAL.title);
      const length = Math.max(0.12, Math.min(duration, available - (at - start)));
      if (fontsReady) {
        const split = SplitText.create(ghost, { type: "lines", mask: "lines" });
        splits.push(split);
        timeline.fromTo(split.lines, { yPercent: 100 }, { yPercent: 0, duration: length, ease: ADMIN_REVEAL_EASE.out }, at);
      } else {
        // The fonts are still loading: the line would break differently, so it enters whole.
        timeline.fromTo(ghost, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: length, ease: ADMIN_REVEAL_EASE.out }, at);
      }
    });
    watcher.observe(node.element, { childList: true, characterData: true, subtree: true });
    timeline.call(end, undefined, start + Math.min(available, duration + (lines.length - 1) * ADMIN_REVEAL.titleStagger) + 0.001);
  }

  /** A number counts from zero: only the value of its text node changes, in the format of the final text. */
  function count(tile: Element, timeline: Timeline, start: number, available: number) {
    const targets = tile.matches("[data-admin-count]") ? [tile] : [...tile.querySelectorAll("[data-admin-count], [data-admin-odometer]")];
    const counted = new Set<Text>();
    for (const target of targets) {
      if (!(target instanceof HTMLElement) || target.querySelector("[data-odometer-strip]")) continue;
      const text = countNode(target);
      // A number and the odometer inside it are one text node: it counts once.
      if (!text || counted.has(text)) continue;
      counted.add(text);
      // Set up when the count starts, not when the page is read: a tile that waits below the fold
      // keeps its real number (and stays readable) until it is scrolled to.
      let final = "";
      let written = "";
      let state: "waiting" | "counting" | "over" = "waiting";
      let inline = false;
      // A number that is a link (a KPI tile with `href`) is not hidden with its link: the link is named instead.
      const link = target.querySelector<HTMLElement>("a[href], button");
      let named = false;
      const reader = document.createElement("span");
      reader.className = "sr-only";
      reader.setAttribute("data-admin-reveal-ghost", "");
      const begin = () => {
        if (state !== "waiting" || !text.isConnected) return;
        final = text.nodeValue ?? "";
        if (!isCountable(final)) return;
        state = "counting";
        inline = getComputedStyle(target).display === "inline";
        const width = target.getBoundingClientRect().width;
        reader.textContent = final;
        if (link) {
          named = !link.hasAttribute("aria-label");
          if (named) link.setAttribute("aria-label", final.trim());
        } else {
          target.setAttribute("aria-hidden", "true");
          target.after(reader);
        }
        target.style.minWidth = `${Math.ceil(width)}px`;
        if (inline) target.style.display = "inline-block";
        written = countFrame(final, 0);
        text.nodeValue = written;
      };
      const end = () => {
        if (state !== "counting") {
          state = "over";
          return;
        }
        state = "over";
        // Polling changed the number meanwhile: its value stays.
        if (text.nodeValue === written) text.nodeValue = final;
        reader.remove();
        if (link && named) link.removeAttribute("aria-label");
        else if (!link) target.removeAttribute("aria-hidden");
        target.style.removeProperty("min-width");
        if (inline) target.style.removeProperty("display");
      };
      const progress = { value: 0 };
      timeline.to(progress, {
        value: 1,
        duration: Math.max(0.2, Math.min(ADMIN_REVEAL.count * (phone ? ADMIN_REVEAL.phone.scale : 1), available)),
        ease: "power2.out",
        onStart: begin,
        onUpdate: () => {
          if (state !== "counting") return;
          if (text.nodeValue !== written) return end();
          written = countFrame(final, progress.value);
          text.nodeValue = written;
        },
        onComplete: end,
      }, start);
      cleanups.push(end);
    }
  }

  function draw(node: Found, timeline: Timeline, start: number, available: number) {
    const element = node.element;
    const kind = node.kind as DrawKind;
    const base = DRAW_REGISTRY[kind];
    const scale = phone ? ADMIN_REVEAL.phone.scale : 1;
    const grow = (bar: Element, at: number, duration: number) => {
      const vertical = bar.getAttribute("data-admin-bar") === "y";
      timeline.fromTo(bar, vertical ? { scaleY: 0, transformOrigin: "50% 100%" } : { scaleX: 0, transformOrigin: "0% 50%" }, { ...(vertical ? { scaleY: 1 } : { scaleX: 1 }), duration, ease: base.ease, clearProps: "transform,transformOrigin" }, at);
    };
    if (kind === "bars") {
      const bars = [...element.querySelectorAll("[data-admin-bar]")];
      const fitted = fitStagger(bars.length, base.duration * scale, base.stagger, available);
      bars.forEach((bar, index) => grow(bar, start + index * fitted.each, fitted.duration));
      return;
    }
    if (kind === "funnel") {
      const steps = [...element.children];
      const fitted = fitStagger(steps.length, base.duration * scale, base.stagger, available);
      steps.forEach((step, index) => {
        const at = start + index * fitted.each;
        for (const bar of step.querySelectorAll("[data-admin-bar]")) grow(bar, at, fitted.duration);
        // The share that went on appears as its bar arrives.
        const rate = step.querySelector("[data-funnel-rate], [data-funnel-ratio]");
        const fade = Math.min(FADE, fitted.duration);
        if (rate) timeline.fromTo(rate, { opacity: 0 }, { opacity: 1, duration: fade, ease: "none", clearProps: "opacity" }, at + fitted.duration - fade);
      });
      return;
    }
    if (kind === "cells") {
      const cells = [...element.querySelectorAll("[data-admin-cell]")];
      const places = cells.map((cell) => {
        const [row, col] = (cell.getAttribute("data-admin-cell") ?? "").split(":").map(Number);
        return { row: row || 0, col: col || 0 };
      });
      const peakIndex = cells.findIndex((cell) => cell.hasAttribute("data-peak"));
      const wave = waveDelays(places, peakIndex >= 0 ? places[peakIndex] : null, { total: available, phone });
      // `from`: a cell without a value keeps its own faded look at the end.
      cells.forEach((cell, index) => timeline.from(cell, { opacity: 0, scale: 0.6, duration: wave.duration, ease: base.ease, clearProps: "opacity,transform" }, start + wave.delays[index]));
      return;
    }
    const duration = Math.min(base.duration * scale, available);
    if (kind === "ring") {
      const mask = element.querySelector("[data-admin-ring-mask]");
      if (mask) timeline.fromTo(mask, { drawSVG: "0%" }, { drawSVG: "100%", duration, ease: base.ease, clearProps: "strokeDasharray,strokeDashoffset" }, start);
      // A full ring wears a check: it is drawn as the ring closes.
      const check = element.parentElement?.querySelector(".lucide-check path");
      if (check) timeline.fromTo(check, { drawSVG: "0%" }, { drawSVG: "100%", duration: duration * 0.5, ease: base.ease, clearProps: "strokeDasharray,strokeDashoffset" }, start + duration * 0.5);
      return;
    }
    // line
    const svg = (element as SVGElement).ownerSVGElement;
    const measurable = element.getAttribute("vector-effect") !== "non-scaling-stroke" && element instanceof SVGGeometryElement && element.getTotalLength() > 0;
    if (measurable) timeline.fromTo(element, { drawSVG: "0%" }, { drawSVG: "100%", duration, ease: base.ease, clearProps: "strokeDasharray,strokeDashoffset" }, start);
    // A stretched line with `non-scaling-stroke` has no measurable length: it is uncovered from the left instead.
    else timeline.fromTo(element, { clipPath: "inset(-10% 100% -10% -10%)" }, { clipPath: "inset(-10% -10% -10% -10%)", duration, ease: base.ease, clearProps: "clipPath" }, start);
    for (const area of svg?.querySelectorAll("[data-admin-area]") ?? []) timeline.from(area, { opacity: 0, duration: duration / 2, ease: "none", clearProps: "opacity" }, start + duration / 2);
    const dots = [...(svg?.querySelectorAll("[data-admin-dot]") ?? [])];
    dots.forEach((dot, index) => timeline.from(dot, { opacity: 0, duration: Math.min(FADE, duration), ease: "none", clearProps: "opacity" }, start + (duration - Math.min(FADE, duration)) * ((index + 1) / dots.length)));
  }

  /** Every tween of `node`, starting at `start`; `duration` is what the schedule left for it. */
  function build(node: Found, timeline: Timeline, start: number, duration: number, available: number, rowSlots?: readonly { start: number; duration: number }[]) {
    const { element, kind } = node;
    if (isDrawKind(kind)) return draw(node, timeline, start, available);
    if (kind === "title") return title(node, timeline, start, duration, available);
    const short = mode === "short";
    if (kind === "rows") {
      const rows = node.rows ?? [];
      // In the entrance every row has its own place in the scan; in a group the rows follow each other.
      const fitted = fitStagger(rows.length, duration, 0.03, available);
      const slots = rows.map((_, index) => rowSlots?.[index] ?? { start: start + index * fitted.each, duration: fitted.duration });
      const tweens: gsap.core.Tween[] = [];
      cascades.set(element, { rows: rows.map((row) => row.element), tweens });
      rows.forEach((row, index) => {
        const slot = slots[index];
        const tween = gsap.fromTo(row.element, short ? { opacity: 0 } : { opacity: 0, y: 8 }, { opacity: 1, ...(short ? {} : { y: 0 }), duration: slot.duration, ease: ADMIN_REVEAL_EASE.out, clearProps: "opacity,transform" });
        tweens.push(tween);
        timeline.add(tween, slot.start);
        // The medals of a ranking pop one after another with their rows.
        if (!short) for (const medal of row.element.querySelectorAll("[data-medal]")) timeline.fromTo(medal, { scale: 0.6 }, { scale: 1, duration: Math.max(0.1, slot.duration - 0.03), ease: ADMIN_REVEAL_EASE.out, clearProps: "transform" }, slot.start + 0.03);
      });
      timeline.call(() => void cascades.delete(element), undefined, Math.max(start, ...slots.map((slot) => slot.start + slot.duration)) + 0.001);
      return;
    }
    const choreography = REVEAL_REGISTRY[kind];
    if (short) {
      timeline.fromTo(element, { opacity: 0 }, { opacity: 1, duration, ease: "none", clearProps: "opacity" }, start);
      return;
    }
    if (kind === "kpi") {
      timeline.fromTo(element, { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration, ease: choreography.ease, clearProps: choreography.clear }, start);
      count(element, timeline, start, available);
      return;
    }
    const { opacity, y, scale } = choreography.from;
    timeline.fromTo(
      element,
      { ...(opacity === undefined ? {} : { opacity }), ...(y === undefined ? {} : { y }), ...(scale === undefined ? {} : { scale }) },
      { ...(opacity === undefined ? {} : { opacity: 1 }), ...(y === undefined ? {} : { y: 0 }), ...(scale === undefined ? {} : { scale: 1 }), duration, ease: choreography.ease, clearProps: choreography.clear },
      start,
    );
  }

  /** A group outside the entrance (a scroll batch, late content): each node in its own timeline, 60 ms apart. */
  function playGroup(nodes: readonly Found[]) {
    if (!nodes.length) return;
    const slots = groupSchedule(nodes.map((node) => node.kind), { phone });
    context.add(() => {
      nodes.forEach((node, index) => {
        const timeline = gsap.timeline({ delay: slots[index].start });
        build(node, timeline, 0, slots[index].duration, ADMIN_REVEAL.scroll - slots[index].start);
      });
    });
  }

  // ---------------------------------------------------------------------------
  // The entrance
  // ---------------------------------------------------------------------------

  if (!still) {
    guard(() => {
      const viewport = { width: screen.clientWidth, height: screen.clientHeight };
      const edge = ADMIN_REVEAL.threshold * viewport.height;
      const nodes = find([page]);
      const above = nodes.filter((node) => node.top < edge);
      const below = nodes.filter((node) => node.top >= edge);
      const slots = revealSchedule(above, viewport, options);
      context.add(() => {
        const timeline = gsap.timeline({ onComplete: mode === "full" ? input.onFull : undefined });
        above.forEach((node, index) => {
          const slot = slots[index];
          const rowSlots = node.rows ? revealSchedule(node.rows.map((row) => ({ kind: "rows" as const, top: row.top, left: row.left })), viewport, options) : undefined;
          build(node, timeline, slot.start, slot.duration, budget - slot.start, rowSlots);
        });
        // The scan line: from the top of the screen to its bottom, lighting what it passes.
        if (mode === "full" && scanLine) {
          const scale = phone ? ADMIN_REVEAL.phone.scale : 1;
          timeline
            .fromTo(scanLine, { y: 0, opacity: 1 }, { y: viewport.height, duration: ADMIN_REVEAL.scan * scale, ease: "none" }, 0)
            .to(scanLine, { opacity: 0, duration: ADMIN_REVEAL.scanFade, ease: "none", clearProps: "opacity,transform" }, ADMIN_REVEAL.scan * scale);
        }
        // An empty page still counts as entered.
        if (!timeline.duration()) timeline.to({}, { duration: 0.01 });

        // Below the fold: hidden now, revealed once when the screen scrolls there.
        if (below.length) {
          const waiting = new Map<Element, { node: Found; timeline: Timeline }>();
          for (const node of below) {
            const paused = gsap.timeline({ paused: true });
            build(node, paused, 0, mode === "short" ? FADE : revealDuration(node.kind) * (phone ? ADMIN_REVEAL.phone.scale : 1), ADMIN_REVEAL.scroll);
            waiting.set(node.element, { node, timeline: paused });
          }
          const play = (entries: readonly { node: Found; timeline: Timeline }[]) => {
            const group = groupSchedule(entries.map((entry) => entry.node.kind), { phone });
            entries.forEach((entry, index) => {
              waiting.delete(entry.node.element);
              const natural = entry.timeline.duration() || 1;
              // The whole group is done within 500 ms: a long node is played faster.
              entry.timeline.timeScale(Math.max(1, natural / Math.max(0.12, ADMIN_REVEAL.scroll - group[index].start)));
              entry.timeline.delay(group[index].start).restart(true);
            });
          };
          ScrollTrigger.batch([...waiting.keys()], {
            scroller: screen,
            start: `top ${Math.round(ADMIN_REVEAL.threshold * 100)}%`,
            once: true,
            interval: 0.08,
            batchMax: 6,
            onEnter: (batch) => guard(() => play(batch.map((element) => waiting.get(element)).filter((entry) => entry !== undefined))),
          });
          // The fuse (V5, RV S5): whatever still waits long after the navigation, and everything that waits when
          // the page is printed, is put into its final state at once, without a move.
          const release = () => {
            for (const entry of [...waiting.values()]) entry.timeline.progress(1);
            waiting.clear();
          };
          const letGo = () => guard(release);
          const fuse = setTimeout(letGo, Math.max(0, ADMIN_REVEAL.fuse * 1000 - (performance.now() - enteredAt)));
          window.addEventListener("beforeprint", letGo);
          cleanups.push(() => {
            clearTimeout(fuse);
            window.removeEventListener("beforeprint", letGo);
          });
          // The content never depends on the trigger: a node that is on the screen and still waits
          // (the layout moved without a scroll) is revealed all the same.
          if (typeof IntersectionObserver !== "undefined") {
            const timers = new Set<ReturnType<typeof setTimeout>>();
            const safety = new IntersectionObserver((entries) => {
              const shown = entries.filter((entry) => entry.isIntersecting).map((entry) => entry.target);
              if (!shown.length) return;
              const timer = setTimeout(() => {
                timers.delete(timer);
                guard(() => context.add(() => play(shown.map((element) => waiting.get(element)).filter((entry) => entry !== undefined))));
              }, 400);
              timers.add(timer);
            }, { root: screen });
            for (const element of waiting.keys()) safety.observe(element);
            cleanups.push(() => {
              safety.disconnect();
              for (const timer of timers) clearTimeout(timer);
            });
          }
        }
      });
    });
  } else {
    // Drawn by the server: what is painted stays; only what arrives later is revealed.
    guard(() => void find([page]));
  }
  if (failed) return finish;

  // ---------------------------------------------------------------------------
  // After the entrance: late content, a replaced skeleton, live rows
  // ---------------------------------------------------------------------------

  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  const refreshSoon = () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      ScrollTrigger.refresh();
    }, 120);
  };
  cleanups.push(() => {
    if (refreshTimer) clearTimeout(refreshTimer);
  });

  let search = window.location.search;
  let searchChangedAt = enteredAt;
  /** The query string changed since the page was entered: what loads from now on answers a filter. */
  let queryChanged = false;
  const isSkeleton = (node: Node) => isElement(node) && (node.matches(SKELETON) || node.querySelector(SKELETON) !== null);

  const onMutations = (records: MutationRecord[]) => {
    const now = performance.now();
    if (window.location.search !== search) {
      search = window.location.search;
      searchChangedAt = now;
      queryChanged = true;
    }
    // One commit of React is one batch, but the skeleton that leaves and the content that takes its place are
    // two records of the same parent: the places a skeleton left are read first.
    const emptied = new Set<Node>();
    for (const record of records) if ([...record.removedNodes].some(isSkeleton)) emptied.add(record.target);
    const settle = () => {
      for (const place of emptied) if (isElement(place)) regions.add(place);
    };
    const added: HTMLElement[] = [];
    const replaced: HTMLElement[] = [];
    const arrived = new Map<Element, HTMLElement[]>();
    for (const record of records) {
      const target = record.target as Element;
      if (!isElement(target) || target.closest(SKIP)) continue;
      const fresh = [...record.addedNodes].filter((node): node is HTMLElement => isElement(node) && node.isConnected && !node.matches(SKIP));
      if (rowLists.has(target)) {
        // A list changed while its cascade runs (a filter): the cascade ends at once. Only its own tweens are
        // killed: FLIP has measured in the commit, before this, and its glide of the same rows goes on.
        const running = cascades.get(target);
        if (running && (record.addedNodes.length || record.removedNodes.length)) {
          cascades.delete(target);
          for (const tween of running.tweens) tween.kill();
          for (const row of running.rows) {
            const others = gsap.getTweensOf(row);
            const moved = (...props: string[]) => others.some((tween) => props.some((prop) => prop in tween.vars));
            const clear = [moved("opacity") ? "" : "opacity", moved("x", "y") ? "" : "transform"].filter(Boolean).join(",");
            if (clear) gsap.set(row, { clearProps: clear });
          }
        }
        const rows = fresh.filter((row) => !seen.has(row));
        if (rows.length) arrived.set(target, [...(arrived.get(target) ?? []), ...rows]);
        continue;
      }
      added.push(...fresh);
      if (emptied.has(target)) replaced.push(...fresh);
    }
    if (!added.length && !arrived.size) return settle();

    const inWindow = inRevealWindow(enteredAt, now);
    /** How what took the place of a skeleton under `place` enters. */
    const verdict = (place: Element | null) =>
      lateReveal({ inWindow, replacedSkeleton: place !== null && emptied.has(place), regionSeen: place !== null && regions.has(place), queryChanged });

    // Inside the window everything new gets its choreography at once, without making the entrance longer.
    // After it only the first read of a place does (the real admin waits for its queries); the rest is
    // written down as seen, and no layout is read for it.
    const late = find(inWindow ? added : replaced.filter((element) => verdict(element.parentElement) === "group"));
    if (!inWindow) note(added);

    let origin: DOMRect | null = null;
    for (const [list, rows] of arrived) {
      // A list that was empty until now gets its first rows: they cascade. Rows added to a list that
      // already had some (a filter) are left to FLIP.
      const wasEmpty = ![...list.children].some((child) => seen.has(child));
      for (const row of rows) seen.add(row);
      if (wasEmpty && list instanceof HTMLElement && (inWindow || verdict(list) === "group")) {
        const box = list.getBoundingClientRect();
        if (box.width === 0 && box.height === 0) continue;
        origin ??= screen.getBoundingClientRect();
        late.push({
          element: list,
          kind: "rows",
          top: box.top - origin.top,
          left: box.left - origin.left,
          rows: rows.slice(0, revealRowsMax(phone)).map((row) => ({ element: row, top: 0, left: 0 })),
        });
        continue;
      }
      if (inWindow) continue;
      // A row that arrived while the page is open: it enters from above with a green edge that fades.
      if (!isLiveRow({ afterWindow: true, seen: false, sinceQueryChange: now - searchChangedAt, listWasEmpty: wasEmpty, addedTogether: rows.length })) continue;
      context.add(() => gsap.fromTo(rows, { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: ADMIN_REVEAL.liveRow, ease: ADMIN_REVEAL_EASE.out, clearProps: "opacity,transform" }));
      const edges = rows.map((row) => (row instanceof HTMLTableRowElement ? row.firstElementChild ?? row : row));
      for (const edge of edges) edge.setAttribute("data-admin-live-edge", "");
      const timer = setTimeout(() => {
        for (const edge of edges) edge.removeAttribute("data-admin-live-edge");
      }, ADMIN_REVEAL.liveEdge * 1000 + 50);
      cleanups.push(() => {
        clearTimeout(timer);
        for (const edge of edges) edge.removeAttribute("data-admin-live-edge");
      });
    }
    settle();

    const entering = new Set<Element>(late.map((node) => node.element));
    // What replaces a skeleton and has no choreography of its own fades in over it.
    const fading = replaced.filter((element) => !entering.has(element));
    if (fading.length) context.add(() => gsap.fromTo(fading, { opacity: 0 }, { opacity: 1, duration: FADE, ease: "none", clearProps: "opacity" }));
    playGroup(late);
    refreshSoon();
  };
  const observer = new MutationObserver((records) => guard(() => onMutations(records)));
  observer.observe(page, { childList: true, subtree: true });
  cleanups.push(() => observer.disconnect());

  // The page changes its height without a scroll (content loads, a group folds): the triggers measure again.
  if (typeof ResizeObserver !== "undefined" && !still) {
    let firstCall = true;
    const resize = new ResizeObserver(() => {
      if (firstCall) firstCall = false;
      else refreshSoon();
    });
    resize.observe(page);
    cleanups.push(() => resize.disconnect());
  }

  return finish;
}
