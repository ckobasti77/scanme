// ADMIN v3 V4 — the ceremonies (plan §6.10). Pure: which events are celebrated
// and in what order, how a ceremony may appear right now, how long it lasts and
// where its particles fly. Nothing here draws; components/admin/game does.

import { ADMIN_CEREMONY } from "@/lib/admin-v2/motion";
import type { BadgeId, RankId, Rarity } from "./ids";
import type { CeremonyEnv, CeremonyEvent, CeremonyForm, CeremonyItem, CeremonyPlan, CeremonySize } from "./types";

/** The badge that stands for a new rank; the rank and the badge are one ceremony. */
export const RANK_BADGE: Partial<Record<RankId, BadgeId>> = {
  operater: "operater",
  dispecer: "dispecer",
  komandant: "komandant",
  legenda: "legenda",
};

/** No ceremony draws more particles than this. */
export const CEREMONY_PARTICLES_MAX = 120;
const CARD_PARTICLES_MAX = 24;

/** The same key is never celebrated twice. */
export function ceremonyKey(event: CeremonyEvent): string {
  switch (event.kind) {
    case "level":
      return `level:${event.level}`;
    case "boss":
      return `boss:${event.dayKey}`;
    case "badge":
      return `badge:${event.badge}`;
    case "record":
      return `record:${event.key}`;
  }
}

/** A level, the boss and an epic or legendary badge fill the screen; the rest is a card. */
export function ceremonySize(event: CeremonyEvent): CeremonySize {
  if (event.kind === "level" || event.kind === "boss") return "big";
  if (event.kind === "badge") return event.rarity === "epska" || event.rarity === "legendarna" ? "big" : "card";
  return "card";
}

const RARITY_RANK: Record<Rarity, number> = { legendarna: 0, epska: 1, retka: 2, obicna: 3 };
const KIND_RANK: Record<CeremonyEvent["kind"], number> = { level: 0, boss: 1, badge: 2, record: 3 };

function compareEvents(a: CeremonyEvent, b: CeremonyEvent): number {
  if (a.kind !== b.kind) return KIND_RANK[a.kind] - KIND_RANK[b.kind];
  if (a.kind === "badge" && b.kind === "badge" && a.rarity !== b.rarity) return RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity];
  if (a.at !== b.at) return a.at - b.at;
  const keyA = ceremonyKey(a);
  const keyB = ceremonyKey(b);
  return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
}

/**
 * What is celebrated now: the new events minus what was seen, one level (the
 * highest), a new rank and its badge as one item, at most two shown and the rest
 * counted. The input is not changed. `seen` of the plan lists every new key that
 * is now settled: shown, rest, the badge merged into a rank and the lower levels.
 */
export function ceremonyQueue(events: readonly CeremonyEvent[], seen: ReadonlySet<string>): CeremonyPlan {
  // 1. Only what is new, each key once.
  const fresh = new Map<string, CeremonyEvent>();
  for (const event of events) {
    const key = ceremonyKey(event);
    if (!seen.has(key) && !fresh.has(key)) fresh.set(key, event);
  }

  // 2. One level: the highest; the lower ones are settled without a ceremony.
  const absorbed: string[] = [];
  let top: Extract<CeremonyEvent, { kind: "level" }> | null = null;
  for (const event of fresh.values()) if (event.kind === "level" && (top === null || event.level > top.level)) top = event;
  const kept: CeremonyEvent[] = [];
  for (const [key, event] of fresh) {
    if (event.kind === "level" && event !== top) absorbed.push(key);
    else kept.push(event);
  }

  // 3. A new rank and the badge of that rank are one item.
  let alsoBadge: BadgeId | undefined;
  let queue = kept;
  const rankBadge = top?.rankUp ? RANK_BADGE[top.rank] : undefined;
  if (rankBadge !== undefined && kept.some((event) => event.kind === "badge" && event.badge === rankBadge)) {
    alsoBadge = rankBadge;
    queue = kept.filter((event) => !(event.kind === "badge" && event.badge === rankBadge));
    absorbed.push(`badge:${rankBadge}`);
  }

  // 4. Order; 5. the first two are shown.
  const items: CeremonyItem[] = [...queue]
    .sort(compareEvents)
    .map((event) => (event === top && alsoBadge !== undefined ? { key: ceremonyKey(event), size: ceremonySize(event), event, alsoBadge } : { key: ceremonyKey(event), size: ceremonySize(event), event }));
  const show = items.slice(0, ADMIN_CEREMONY.maxInRow);
  const rest = items.slice(ADMIN_CEREMONY.maxInRow);
  return { show, rest, seen: [...show, ...rest].map((item) => item.key).concat(absorbed) };
}

/** How a ceremony appears now: a layer over the screen, one calm toast, or nothing. */
export function ceremonyForm(item: CeremonyItem, env: CeremonyEnv): CeremonyForm {
  // A record is a celebration, not information: the quiet mode drops it (as in v2).
  if (item.event.kind === "record" && env.quiet) return { as: "none" };
  if (env.quiet || env.reducedMotion) return { as: "toast" };
  // Never cover a field the person is typing in or a dialog they are reading.
  if (env.editable || env.modal) return { as: "toast" };
  if (env.phone) return { as: "layer", size: "card" };
  return { as: "layer", size: item.size };
}

const round = (value: number) => Math.round(value * 1000) / 1000;

/** The phases of a ceremony (seconds): `big` is the medal in the centre, `card` the compact one. */
export function ceremonySeconds(size: CeremonySize): { in: number; hold: number; out: number; total: number } {
  const phase = size === "big" ? ADMIN_CEREMONY.big : ADMIN_CEREMONY.compact;
  return { in: phase.in, hold: phase.hold, out: phase.out, total: round(phase.in + phase.hold + phase.out) };
}

/** The shown ceremonies one after another with the pause between them. */
export function planSeconds(plan: CeremonyPlan): number {
  if (plan.show.length === 0) return 0;
  const total = plan.show.reduce((sum, item) => sum + ceremonySeconds(item.size).total, 0);
  return round(total + ADMIN_CEREMONY.gap * (plan.show.length - 1));
}

export type CeremonyParticle = {
  /** Direction of flight (radians, 0 to the right, y grows downwards). */
  angle: number;
  /** How far it flies: a share of the shorter side of the screen, at most 0.5. */
  speed: number;
  /** Radius in px at scale 1. */
  size: number;
  /** When it starts, as a share of the whole ceremony (0–0.25). */
  delay: number;
  /** 0–1; the caller picks the colour. */
  hue: number;
};

// mulberry32: a small seeded generator, so the same seed draws the same burst.
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The burst of a ceremony: at most 120 particles for a big one, 24 for a card. */
export function ceremonyParticles(size: CeremonySize, seed: number): CeremonyParticle[] {
  const random = seeded(seed);
  const count = size === "big" ? CEREMONY_PARTICLES_MAX : CARD_PARTICLES_MAX;
  const reach = size === "big" ? 0.5 : 0.22;
  const grain = size === "big" ? 4.5 : 3;
  return Array.from({ length: count }, () => ({
    angle: random() * Math.PI * 2,
    speed: reach * (0.2 + 0.8 * random()),
    size: 1.5 + random() * (grain - 1.5),
    delay: random() * 0.25,
    hue: random(),
  }));
}

const FALL = 0.06;

/**
 * Where a particle is at `progress` (0–1 over the whole ceremony), as an offset
 * from the origin in shares of the shorter side of the screen. It flies out with
 * an ease-out, sinks a little, fades in and then to nothing, and shrinks to 0.4.
 */
export function particleAt(particle: CeremonyParticle, progress: number): { x: number; y: number; alpha: number; scale: number } {
  if (progress <= 0 || progress >= 1) return { x: 0, y: 0, alpha: 0, scale: progress >= 1 ? 0.4 : 1 };
  const t = Math.min(1, Math.max(0, (progress - particle.delay) / (1 - particle.delay)));
  if (t === 0) return { x: 0, y: 0, alpha: 0, scale: 1 };
  const eased = 1 - (1 - t) ** 3;
  const distance = particle.speed * eased;
  const alpha = t < 0.15 ? t / 0.15 : (1 - t) / 0.85;
  return {
    x: Math.cos(particle.angle) * distance,
    y: Math.sin(particle.angle) * distance + FALL * t * t,
    alpha: Math.min(1, Math.max(0, alpha)),
    scale: 1 - 0.6 * t,
  };
}
