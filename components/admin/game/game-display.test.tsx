import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import type { BossView, ComboView, FairChallenge, FairNode, OperatorView, StreakView, TeamBoard as TeamBoardData, TeamRow } from "@/lib/admin-v2/game/types";
import { FAIR_CHALLENGE_IDS, FAIR_NODE_IDS, RANK_IDS } from "@/lib/admin-v2/game/ids";
import { ADMIN_GAME_MOTION } from "@/lib/admin-v2/motion";
import { adminGameSr as d } from "@/lib/i18n/sr/admin-game";
import { BossBar, bossEventText, type BossBarEvent } from "./boss-bar";
import { ComboMeter } from "./combo-meter";
import { FairChain } from "./fair-chain";
import { FairChallenges } from "./fair-challenges";
import { OperatorRow } from "./operator-row";
import { StreakFlame, dayNoun, streakDayText, streakText } from "./streak-flame";
import { TeamBoard } from "./team-board";
import { XpChip, XpProfileRing } from "./xp-chip";

// ADMIN v3 V4 — the display components of the game (plan §6.3–6.8, §6.11): every
// state of the contract, the attributes for assistive technology, and nothing
// drawn when there is nothing to draw. TEST names and made-up numbers only.

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode } & Record<string, unknown>) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("convex/react", () => ({ useQuery: () => undefined, useConvex: () => ({}) }));

const html = (node: ReactNode) => renderToStaticMarkup(<>{node}</>);
const noop = () => {};

const OPERATOR: OperatorView = { level: 7, rank: "operater", xp: 2100, into: 300, span: 700, share: 300 / 700, todayXp: 45, since: null, complete: true };
const STREAK: StreakView = { count: 5, best: 7, flame: 3, todayDone: true, brokenOn: null, since: "2026-10-01" };

describe("XpChip", () => {
  test("nothing without an operator", () => {
    expect(html(<XpChip operator={null} onOpen={noop} />)).toBe("");
    expect(html(<XpProfileRing operator={null} />)).toBe("");
  });

  test("where the navbar has no room, the same ring stands around the profile icon: decoration, no tab stop", () => {
    const out = html(<XpProfileRing operator={OPERATOR} className="min-[87.5rem]:hidden" />);
    expect(out).toMatch(/^<span data-admin-xp-ring="" aria-hidden="true" class="pointer-events-none absolute inset-0 m-auto size-9 min-\[87\.5rem\]:hidden">/);
    // The fill is the energy ink (3:1 on both surfaces), not the line colour of the navbar.
    expect(out).toContain('stroke="var(--admin-energy-ink)"');
    expect(out).not.toContain("--admin-nav-line");
    expect(out).not.toMatch(/<button|tabindex/);
  });

  test("N11 — the level is a number on the ring, a badge at its lower right: decoration inside the ring, no new tab stop", () => {
    const out = html(<XpProfileRing operator={OPERATOR} />);
    expect(out).toMatch(/<span data-admin-xp-level="" class="absolute -right-1 -bottom-1 [^"]*">7<\/span><\/span>$/);
    // One ring only: the badge is not a second `data-admin-xp-ring` (the spark looks for the first visible one).
    expect(out.match(/data-admin-xp-ring=""/g)).toHaveLength(1);
    expect(out).not.toMatch(/<button|tabindex/);
  });

  test("a button with the ring, the level in it and the short level from xl", () => {
    const out = html(<XpChip operator={OPERATOR} onOpen={noop} />);
    expect(out).toMatch(/^<button type="button" data-admin-xp-chip=""/);
    // The name for assistive technology and the tooltip are the same sentence.
    expect(out).toContain('aria-label="Operater, nivo 7. Otvori Vitrinu."');
    expect(out).toContain('title="Operater, nivo 7. Otvori Vitrinu."');
    expect(out).toContain("min-h-11");
    expect(out).toContain('data-admin-xp-ring=""');
    expect(out).toMatch(/<span class="absolute[^"]*">7<\/span>/);
    // The chip is shown only where the navbar has room for it (the navbar decides); then „Nv 7“ is always beside the ring.
    expect(out).toMatch(/<span aria-hidden="true" class="whitespace-nowrap tabular-nums">Nv 7</);
    // The earned part of the level is an arc of the circumference, the track is the border token.
    expect(out).toContain('stroke="var(--admin-energy-ink)"');
    expect(out).toContain('stroke="var(--admin-border)"');
    const circumference = 2 * Math.PI * 15.5;
    const part = (300 / 700) * circumference;
    expect(out).toContain(`stroke-dasharray="${part.toFixed(2)} ${(circumference - part).toFixed(2)}"`);
  });

  test("a level with nothing earned draws the track only; every rank names itself", () => {
    expect(html(<XpChip operator={{ ...OPERATOR, share: 0 }} onOpen={noop} />)).not.toContain('stroke="var(--admin-energy-ink)"');
    for (const rank of RANK_IDS) expect(html(<XpChip operator={{ ...OPERATOR, rank }} onOpen={noop} />)).toContain(`aria-label="${d.ranks[rank]}, nivo 7.`);
  });

  test("N11 — on a phone the chip is the ring alone: a real button of 44 × 44 px with the level in the ring and the same name", () => {
    const out = html(<XpChip operator={OPERATOR} onOpen={noop} compact className="lg:hidden" />);
    expect(out).toMatch(/^<button type="button" data-admin-xp-chip=""/);
    expect(out).toContain('aria-label="Operater, nivo 7. Otvori Vitrinu."');
    expect(out).toMatch(/class="[^"]*\bsize-11\b[^"]*\blg:hidden\b/);
    expect(out).not.toMatch(/class="[^"]*\bpx-2\b/);
    expect(out).toMatch(/<span class="absolute[^"]*">7<\/span>/);
    // „Nv 7“ is left out: there is no room for it in the bar of a phone.
    expect(out).not.toContain("Nv 7");
    expect(out.match(/data-admin-xp-ring=""/g)).toHaveLength(1);
    expect(html(<XpChip operator={null} onOpen={noop} compact />)).toBe("");
  });
});

describe("StreakFlame", () => {
  test("dayNoun follows the Serbian plural", () => {
    expect(dayNoun(1)).toBe("dan");
    expect(dayNoun(2)).toBe("dana");
    expect(dayNoun(5)).toBe("dana");
    expect(dayNoun(11)).toBe("dana");
    expect(dayNoun(12)).toBe("dana");
    expect(dayNoun(21)).toBe("dan");
    expect(dayNoun(22)).toBe("dana");
    expect(dayNoun(0)).toBe("dana");
  });

  test("the five sizes grow, a flame of zero is grey, the others warn", () => {
    const sizes = ["size-3.5", "size-3.5", "size-4", "size-[1.125rem]", "size-5", "size-6"];
    for (const flame of [0, 1, 2, 3, 4, 5] as const) {
      const out = html(<StreakFlame streak={{ ...STREAK, flame, count: flame }} />);
      expect(out).toContain(`data-flame="${flame}"`);
      expect(out).toContain(sizes[flame]);
      expect(out).toContain(flame === 0 ? "text-[var(--admin-text-muted)]" : "text-[var(--admin-warning)]");
    }
    expect(html(<StreakFlame streak={{ ...STREAK, flame: 4, count: 12 }} />)).not.toContain("size-3.5");
  });

  test("a running streak says its days and whether today is written down", () => {
    expect(streakText(STREAK)).toBe("5 dana u nizu. Danas je upisan.");
    expect(streakText({ ...STREAK, count: 1, todayDone: false })).toBe("1 dan u nizu. Danas još nije upisan.");
    expect(streakText({ ...STREAK, count: 21 })).toBe("21 dan u nizu. Danas je upisan.");
    const out = html(<StreakFlame streak={STREAK} />);
    // The tooltip also says how a day gets written down.
    expect(out).toContain(`title="5 dana u nizu. Danas je upisan. ${d.streak.rule}"`);
    expect(out).toContain('<span class="sr-only">5 dana u nizu. Danas je upisan.</span>');
    // The icon and the number are decoration for a screen reader: the sentence says it.
    expect(out).toContain('aria-hidden="true" class="tabular-nums">5<');
  });

  test("a broken streak is told honestly, with the day and the record", () => {
    const broken = { ...STREAK, count: 0, flame: 0 as const, brokenOn: "2026-10-13", best: 7 };
    expect(streakDayText("2026-10-13")).toBe("utorak, 13. 10");
    expect(streakText(broken)).toBe("Niz prekinut: utorak, 13. 10. Rekord: 7 dana.");
    expect(streakText({ ...broken, best: 1 })).toBe("Niz prekinut: utorak, 13. 10. Rekord: 1 dan.");
    expect(streakDayText("nije datum")).toBe("nije datum");
  });

  test("no streak at all", () => {
    expect(streakText({ ...STREAK, count: 0, flame: 0, brokenOn: null })).toBe(d.streak.none);
  });
});

describe("OperatorRow", () => {
  test("nothing without an operator", () => {
    expect(html(<OperatorRow operator={null} streak={STREAK} onOpen={noop} />)).toBe("");
  });

  test("the rank, the level, the bar to the next level and the XP of today", () => {
    const out = html(<OperatorRow operator={OPERATOR} streak={STREAK} onOpen={noop} />);
    expect(out).toContain('data-admin-operator=""');
    expect(out).toContain('aria-label="Operater"');
    expect(out).toContain('aria-label="Operater, nivo 7. Otvori Vitrinu."');
    expect(out).toContain("Nivo 7");
    expect(out).toContain('role="progressbar" aria-label="Napredak do sledećeg nivoa" aria-valuemin="0" aria-valuemax="700" aria-valuenow="300" aria-valuetext="300 od 700 XP do nivoa 8"');
    expect(out).toContain(`transform:scaleX(${300 / 700})`);
    expect(out).toContain("origin-left");
    expect(out).toContain("bg-[var(--admin-energy-ink)]");
    expect(out).toContain("Danas +45 XP");
    // The flame of the streak sits in the heading line.
    expect(out).toContain('data-admin-streak=""');
    // One button, and the bar is not inside it (a button's children lose their meaning).
    expect(out.match(/<button/g)).toHaveLength(1);
    const button = out.slice(out.indexOf("<button"), out.indexOf("</button>"));
    expect(button).not.toContain("progressbar");
  });

  test("N12 — the fill follows its number: a transform transition of 0.22 s, none with reduced motion or in the quiet mode", () => {
    const out = html(<OperatorRow operator={OPERATOR} streak={STREAK} onOpen={noop} />);
    // (The `&amp;` is the `&` of the arbitrary variant: it marks the element in „inside a quiet frame“.)
    expect(out).toContain("transition-transform ease-[var(--admin-ease-out)] motion-reduce:transition-none [.admin-v1[data-admin-quiet]_&amp;]:transition-none");
    expect(out).toContain(`transition-duration:${ADMIN_GAME_MOTION.xpBar}s`);
    expect(ADMIN_GAME_MOTION.xpBar).toBe(0.22);
    // Only the transform moves: no transition of everything on the fill.
    expect(out).not.toContain("transition-all");
  });

  test("S10 — without `dense` (the drawer of a phone) the row is the full one: no variant of a low window", () => {
    const out = html(<OperatorRow operator={OPERATOR} streak={STREAK} onOpen={noop} />);
    expect(out).not.toContain("max-height");
    expect(out).not.toContain("Nv 7");
  });

  test("S10 — `dense` (the sidebar): one line up to 800 px of height, the text of the rest kept for assistive technology", () => {
    const out = html(<OperatorRow operator={{ ...OPERATOR, complete: false, since: Date.UTC(2026, 8, 3, 10) }} streak={STREAK} onOpen={noop} dense />);
    const low = "[@media(max-height:800px)]:";
    // The section becomes a flex line; the heading line dissolves into it (the flame goes last) and the heading is read, not seen.
    expect(out).toContain(`${low}flex ${low}items-center`);
    expect(out).toContain(`${low}contents`);
    expect(out).toContain(`${low}sr-only">Operater</p>`);
    expect(out).toContain(`${low}order-last`);
    // The long level gives way to the short one; the short one is decoration (the button has its name).
    expect(out).toContain(`${low}hidden">Nivo 7<`);
    expect(out).toMatch(/<span aria-hidden="true" class="hidden [^"]*max-height:800px\)\]:inline">Nv 7<\/span>/);
    // The sentence under the bar and the note of the date are still in the markup, for assistive technology only.
    expect(out).toContain(`${low}sr-only"><span>300 od 700 XP do nivoa 8</span>`);
    expect(out).toContain(`${low}sr-only">XP se računa od 3. 9. 2026.</p>`);
    // The bar keeps its values for assistive technology; the target of the block stays 44 px on a touch layout.
    expect(out).toContain('aria-valuetext="300 od 700 XP do nivoa 8"');
    expect(out).toContain(`${low}pointer-coarse:min-h-11`);
    // Still one button, and the bar is outside it.
    expect(out.match(/<button/g)).toHaveLength(1);
    expect(out.slice(out.indexOf("<button"), out.indexOf("</button>"))).not.toContain("progressbar");
  });

  test("no XP today, no streak, a complete history: only what is true", () => {
    const out = html(<OperatorRow operator={{ ...OPERATOR, todayXp: 0 }} streak={null} onOpen={noop} />);
    expect(out).not.toContain("Danas +");
    expect(out).not.toContain("data-admin-streak");
    expect(out).not.toContain("XP se računa od");
  });

  test("a history that was not read back says from when the XP is counted", () => {
    const since = Date.UTC(2026, 8, 3, 10);
    expect(html(<OperatorRow operator={{ ...OPERATOR, complete: false, since }} streak={null} onOpen={noop} />)).toContain("XP se računa od 3. 9. 2026.<");
    // Not complete but no date known: nothing to say.
    expect(html(<OperatorRow operator={{ ...OPERATOR, complete: false, since: null }} streak={null} onOpen={noop} />)).not.toContain("XP se računa od");
  });
});

describe("BossBar", () => {
  const alive: BossView = { kind: "alive", hp: 12, hpMax: 30, share: 0.4, returned: false };
  const hit = (mine: boolean): BossBarEvent => ({ kind: "hit", damage: 3, mine, seq: 1 });

  test("the title and the help are always there", () => {
    for (const boss of [{ kind: "unavailable" }, { kind: "none" }, alive, { kind: "down", hpMax: 30, downAt: Date.UTC(2026, 9, 13, 9, 5) }] as BossView[]) {
      const out = html(<BossBar boss={boss} event={null} />);
      expect(out).toContain(`data-game-boss="${boss.kind}"`);
      expect(out).toContain(d.boss.title);
      expect(out).toContain(`title="${d.boss.help}"`);
    }
  });

  test("unavailable and none have no bar", () => {
    const unavailable = html(<BossBar boss={{ kind: "unavailable" }} event={null} />);
    expect(unavailable).toContain(d.boss.unavailable);
    expect(unavailable).not.toContain("progressbar");
    const none = html(<BossBar boss={{ kind: "none" }} event={null} />);
    expect(none).toContain(d.boss.none);
    expect(none).not.toContain("progressbar");
  });

  test("alive: the number and a bar with the values of the health", () => {
    const out = html(<BossBar boss={alive} event={null} />);
    expect(out).toMatch(/font-mono[^>]*tabular-nums[^>]*>12 od 30</);
    expect(out).toContain('role="progressbar" aria-label="Šef dana: zaostatak" aria-valuemin="0" aria-valuemax="30" aria-valuenow="12" aria-valuetext="12 od 30"');
    expect(out).toContain("transform:scaleX(0.4)");
    expect(out).toContain("origin-left");
    expect(out).toContain("bg-[var(--admin-danger)]");
    expect(out).toContain("transition-transform duration-[var(--admin-dur-3)] ease-[var(--admin-ease-out)] motion-reduce:transition-none");
    expect(out).not.toContain(d.boss.returned);
  });

  test("alive again after a defeat says so", () => {
    expect(html(<BossBar boss={{ ...alive, returned: true }} event={null} />)).toContain(d.boss.returned);
  });

  test("a share outside 0–1 is held inside the bar", () => {
    expect(html(<BossBar boss={{ ...alive, share: 1.4 }} event={null} />)).toContain("transform:scaleX(1)");
    expect(html(<BossBar boss={{ ...alive, share: -1 }} event={null} />)).toContain("transform:scaleX(0)");
  });

  test("down: the time in Belgrade, an empty bar that is only a picture, a check", () => {
    const out = html(<BossBar boss={{ kind: "down", hpMax: 30, downAt: Date.UTC(2026, 9, 13, 9, 5) }} event={null} />);
    expect(out).toContain("Šef je pao u 11:05.");
    expect(out).toContain("lucide-circle-check");
    expect(out).toContain("text-[var(--admin-success)]");
    expect(out).not.toContain('role="progressbar"');
  });

  test("the status line is always there so a new text is announced; empty without an event", () => {
    const out = html(<BossBar boss={alive} event={null} />);
    expect(out).toMatch(/<p role="status" class="[^"]*"><\/p>/);
    expect(out).not.toContain("data-boss-event");
  });

  test("a hit of mine: the damage next to the number and in the status line", () => {
    const out = html(<BossBar boss={alive} event={hit(true)} />);
    expect(out).toMatch(/data-boss-event="hit"[^>]*>−3</);
    // The floating number is hidden until the animation shows it and is decoration.
    expect(out).toMatch(/aria-hidden="true" class="[^"]*opacity-0">−3</);
  });

  test("a hit of the team says so", () => {
    const out = html(<BossBar boss={alive} event={hit(false)} />);
    expect(out).toMatch(/data-boss-event="hit"[^>]*>−3 · tim</);
    expect(bossEventText(hit(false))).toBe("−3 · tim");
  });

  test("a postponement is calm text, no damage number", () => {
    const out = html(<BossBar boss={alive} event={{ kind: "snoozed", damage: 2, seq: 2 }} />);
    expect(out).toMatch(/data-boss-event="snoozed"[^>]*>Odloženo: vraća se kad istekne\.</);
    expect(out).not.toContain("opacity-0");
  });

  test("new backlog is amber text, no damage number", () => {
    const out = html(<BossBar boss={alive} event={{ kind: "grew", amount: 4, seq: 3 }} />);
    expect(out).toMatch(/data-boss-event="grew" class="[^"]*text-\[var\(--admin-warning\)\][^"]*">\+4: novi zaostatak</);
    expect(out).not.toContain("opacity-0");
  });

  test("a defeat draws nothing here (the ceremony is the leader's)", () => {
    const out = html(<BossBar boss={{ kind: "down", hpMax: 30, downAt: Date.UTC(2026, 9, 13, 9, 5) }} event={{ kind: "defeated", seq: 4 }} />);
    expect(out).not.toContain("data-boss-event");
    expect(bossEventText({ kind: "defeated", seq: 4 })).toBe("");
    expect(bossEventText(null)).toBe("");
  });
});

describe("ComboMeter", () => {
  const NOW = Date.UTC(2026, 10, 1, 9, 0, 0);
  const combo = (chain: number, multiplier: 1 | 2 | 3, toNext: number | null, left = 60_000): ComboView => ({ chain, multiplier, toNext, lastAt: NOW - 1000, expiresAt: NOW + left });

  test("no combo, or a chain of one, draws nothing", () => {
    expect(html(<ComboMeter combo={null} now={NOW} />)).toBe("");
    expect(html(<ComboMeter combo={combo(1, 1, 2)} now={NOW} />)).toBe("");
  });

  test("chain 2 is still ×1: a muted ring and what is needed for ×2", () => {
    const out = html(<ComboMeter combo={combo(2, 1, 1)} now={NOW} />);
    // Not a live region (the boss line and the ceremony already speak): the sentence is there to be read.
    expect(out).toContain('data-game-combo="1"');
    expect(out).not.toContain('role="status"');
    expect(out).toContain('<span class="sr-only">Kombo ×1, akcija zaredom: 2.</span>');
    expect(out).toContain(`title="${d.combo.help}"`);
    expect(out).toContain("×1");
    expect(out).toContain("još 1 do ×2");
    expect(out).toContain('stroke="var(--admin-text-muted)"');
    expect(out).not.toContain('stroke="var(--admin-energy-ink)"');
  });

  test("chain 5 is ×3, the top, in the energy colour", () => {
    const out = html(<ComboMeter combo={combo(5, 3, null)} now={NOW} />);
    expect(out).toContain('data-game-combo="3"');
    expect(out).toContain('<span class="sr-only">Kombo ×3, akcija zaredom: 5.</span>');
    expect(out).toContain(d.combo.top);
    expect(out).toContain('stroke="var(--admin-energy-ink)"');
  });

  test("the ring starts at the share of the window that is left", () => {
    const circumference = 2 * Math.PI * 14;
    // 60 s of 120 s left: half the ring.
    expect(html(<ComboMeter combo={combo(3, 2, 2, 60_000)} now={NOW} />)).toContain(`stroke-dashoffset="${circumference * 0.5}"`);
    // Full window: nothing is taken off yet. Run out (or in the past): empty.
    expect(html(<ComboMeter combo={combo(3, 2, 2, 120_000)} now={NOW} />)).toContain(`stroke-dashoffset="${circumference * 0}"`);
    expect(html(<ComboMeter combo={combo(3, 2, 2, -5_000)} now={NOW} />)).toContain(`stroke-dashoffset="${circumference}"`);
    // The ring is a picture; the status carries the words.
    expect(html(<ComboMeter combo={combo(3, 2, 2)} now={NOW} />)).toContain('aria-hidden="true" class="relative inline-grid size-8');
  });
});

describe("TeamBoard", () => {
  // Monday 12 October 2026, 00:00 in Belgrade (UTC+2).
  const WEEK = Date.UTC(2026, 9, 11, 22);
  const row = (over: Partial<TeamRow> & Pick<TeamRow, "id" | "name" | "rank">): TeamRow => ({ me: false, xp: 100, atLeast: false, actions: 8, bestChain: 3, medal: null, move: null, ...over });
  const rows: TeamRow[] = [
    row({ id: "a", name: "TEST Ana", rank: 1, medal: 1, xp: 480, actions: 21, bestChain: 5, move: 2 }),
    row({ id: "b", name: "TEST Marko", rank: 2, medal: 2, xp: 300, move: -1 }),
    row({ id: "c", name: "TEST Mina", rank: 3, medal: 3, xp: 220, move: 0 }),
    row({ id: "d", name: "TEST Jovo", rank: 4, xp: 120, atLeast: true, me: true }),
  ];
  const board: TeamBoardData = { weekStart: WEEK, rows };

  test("a board that is not in yet: a loading panel on the page, nothing in the strip", () => {
    const full = html(<TeamBoard board={null} variant="full" />);
    expect(full).toContain('data-game-team="full"');
    expect(full).toContain(`>${d.team.title}</h2>`);
    expect(full).toContain(d.team.loading);
    expect(full).not.toContain("<table");
    expect(html(<TeamBoard board={null} variant="strip" />)).toBe("");
  });

  test("full: the week, the table with the five columns and a body for the reveal", () => {
    const out = html(<TeamBoard board={board} variant="full" />);
    expect(out).toMatch(/<h2 id="[^"]+"[^>]*>Tabela tima<\/h2>/);
    expect(out).toMatch(/aria-labelledby="([^"]+)"/);
    const id = /aria-labelledby="([^"]+)"/.exec(out)![1];
    expect(out).toContain(`<h2 id="${id}"`);
    expect(out).toContain("Nedelja od 12. 10.");
    for (const name of Object.values(d.team.columns)) expect(out).toContain(`scope="col">${name}</th>`);
    expect(out).toContain('<tbody data-admin-reveal="rows">');
    expect(out.match(/<tr data-team-row=/g)).toHaveLength(4);
    expect(out).toContain(d.team.note);
    // Places: medals by name, a plain place by number.
    expect(out).toContain('aria-label="Prvo mesto"');
    expect(out).toContain('aria-label="Treće mesto"');
    expect(out).toContain('aria-label="4. mesto"');
    expect(out).toContain('data-medal="1"');
  });

  test("full: my row is marked and wears the chip; the others do not", () => {
    const out = html(<TeamBoard board={board} variant="full" />);
    expect(out.match(/data-me=""/g)).toHaveLength(1);
    expect(out).toMatch(/<tr data-team-row="d" data-me="" class="[^"]*bg-\[var\(--admin-surface-muted\)\]/);
    expect(out.match(/data-team-me-chip=""/g)).toHaveLength(1);
    expect(out).toContain(">ti</span>");
  });

  test("full: XP in monospace; a capped read says „najmanje“ and why", () => {
    const out = html(<TeamBoard board={board} variant="full" />);
    expect(out).toMatch(/font-mono font-semibold tabular-nums">480</);
    expect(out).toMatch(/font-mono font-semibold tabular-nums">najmanje 120</);
    expect(out).toContain(d.team.capped);
    expect(out.match(new RegExp(d.team.capped, "g"))).toHaveLength(1);
  });

  test("full: the change of place is an arrow and words for assistive technology", () => {
    const out = html(<TeamBoard board={board} variant="full" />);
    expect(out).toContain("gore za 2 od juče");
    expect(out).toContain("dole za 1 od juče");
    expect(out).toContain("bez promene od juče");
  });

  test("full: nobody has XP, the table gives way to one sentence", () => {
    const out = html(<TeamBoard board={{ weekStart: WEEK, rows: rows.map((r) => ({ ...r, xp: 0, medal: null, atLeast: false })) }} variant="full" />);
    expect(out).toContain(d.team.empty);
    expect(out).not.toContain("<table");
  });

  test("strip: a thin panel with the first three and a link to the page", () => {
    const top = { ...board, rows: rows.map((r) => ({ ...r, me: r.id === "b" })) };
    const out = html(<TeamBoard board={top} variant="strip" href="/admin/tim" />);
    expect(out).toContain('data-game-team="strip"');
    expect(out).toContain("px-4 py-2.5");
    expect(out).toContain(d.team.stripTitle);
    // I am second, so nobody is added: three entries, the fourth member is out.
    expect(out.match(/<li /g)).toHaveLength(3);
    expect(out).not.toContain("TEST Jovo");
    expect(out).toContain("480 XP");
    expect(out).toContain(`href="/admin/tim"`);
    expect(out).toContain(d.team.openTeam);
  });

  test("strip: when I am not among the first three my own place is added", () => {
    const out = html(<TeamBoard board={board} variant="strip" />);
    expect(out.match(/<li /g)).toHaveLength(4);
    expect(out).toContain('aria-label="4. mesto"');
    expect(out).toContain("TEST Jovo");
    expect(out).toContain("najmanje 120");
    // No link without a href.
    expect(out).not.toContain("<a ");
  });

  test("strip: nobody has XP, the sentence stands in for the names", () => {
    const out = html(<TeamBoard board={{ weekStart: WEEK, rows: rows.map((r) => ({ ...r, xp: 0, medal: null })) }} variant="strip" href="/admin/tim" />);
    expect(out).toContain(d.team.empty);
    expect(out).not.toContain("<li ");
    expect(out).toContain(d.team.openTeam);
  });
});

describe("FairChain", () => {
  const nodes: FairNode[] = [
    { id: "katalog", state: "lit", done: 40, total: 40 },
    { id: "nalepnice", state: "open", done: 3, total: 8 },
    { id: "izlagaci", state: "locked", done: 0, total: 0 },
  ];

  test("an empty chain draws nothing", () => {
    expect(html(<FairChain nodes={[]} />)).toBe("");
  });

  test("the title, the hint and one entry per node with its state", () => {
    const out = html(<FairChain nodes={nodes} />);
    expect(out).toContain('data-game-fair-chain=""');
    expect(out).toMatch(/aria-labelledby="([^"]+)"/);
    const id = /aria-labelledby="([^"]+)"/.exec(out)![1];
    expect(out).toContain(`<h2 id="${id}" class="text-base font-semibold">${d.fair.chainTitle}</h2>`);
    expect(out).toContain(d.fair.chainHint);
    expect(out).toContain('data-node="katalog" data-state="lit"');
    expect(out).toContain('data-node="nalepnice" data-state="open"');
    expect(out).toContain('data-node="izlagaci" data-state="locked"');
    // The tooltip carries the rule of the node.
    expect(out).toContain(`title="${d.fair.nodes.katalog.hint}"`);
  });

  test("the text is the list: name, state, and progress only for an open node", () => {
    const out = html(<FairChain nodes={nodes} />);
    for (const name of ["Katalog", "Nalepnice", "Izlagači"]) expect(out).toContain(`>${name}</p>`);
    expect(out).toContain(">Gotovo</p>");
    expect(out).toContain(">U toku</p>");
    expect(out).toContain(">Zaključano</p>");
    expect(out).toContain(">3 od 8</p>");
    expect(out.match(/ od /g)).toHaveLength(1);
  });

  test("a lit node is a check, an open one a ring with done/total, a locked one a lock", () => {
    const lit = html(<FairChain nodes={[nodes[0]]} />);
    expect(lit).toContain("lucide-check");
    expect(lit).toContain("bg-[var(--admin-nav-line)]");
    const open = html(<FairChain nodes={[nodes[1]]} />);
    expect(open).toContain("3/8</span>");
    expect(open).toContain('stroke="var(--admin-warning)"');
    expect(open).not.toContain("lucide-lock");
    const locked = html(<FairChain nodes={[nodes[2]]} />);
    expect(locked).toContain("lucide-lock");
    expect(locked).not.toContain("lucide-check");
  });

  test("an open node with a total of zero shows an empty ring, not a broken one", () => {
    const out = html(<FairChain nodes={[{ id: "pitanja", state: "open", done: 0, total: 0 }]} />);
    expect(out).toContain("0/0</span>");
    expect(out).not.toContain('stroke="var(--admin-warning)"');
  });

  test("links lie between nodes only, are decoration, and are solid green after a lit node", () => {
    const out = html(<FairChain nodes={nodes} />);
    expect(out.match(/data-admin-draw="line"/g)).toHaveLength(2);
    // After the lit node: solid in the energy colour; after the open one: dashed grey.
    expect(out).toMatch(/<path data-admin-draw="line"[^>]*stroke="var\(--admin-nav-line\)"><\/path>/);
    expect(out).toMatch(/<path data-admin-draw="line"[^>]*stroke="var\(--admin-border\)" stroke-dasharray="4 4"/);
    expect(out.match(/<svg aria-hidden="true" focusable="false"/g)).toHaveLength(2);
    // One node, no links.
    expect(html(<FairChain nodes={[nodes[0]]} />)).not.toContain("data-admin-draw");
  });

  test("the six nodes of the map, in order, with no tab stop on any of them", () => {
    const all: FairNode[] = FAIR_NODE_IDS.map((id) => ({ id, state: "locked", done: 0, total: 0 }));
    const out = html(<FairChain nodes={all} />);
    expect(FAIR_NODE_IDS.map((id) => out.indexOf(`data-node="${id}"`))).toEqual([...FAIR_NODE_IDS.map((id) => out.indexOf(`data-node="${id}"`))].sort((a, b) => a - b));
    expect(out.match(/data-node=/g)).toHaveLength(6);
    expect(out).not.toContain("tabindex");
    expect(out).not.toContain("<button");
    expect(out).not.toContain("<a ");
  });
});

describe("FairChallenges", () => {
  const items: FairChallenge[] = [
    { id: "skenovi_10", value: 10, target: 10, done: true, missed: false },
    { id: "prestigni_prepodne", value: 29, target: 80, done: false, missed: true },
    { id: "skenovi_50", value: 17, target: 50, done: false, missed: false },
    { id: "hitni_na_nuli", value: 2, target: 0, done: false, missed: false },
  ];

  test("an empty list draws nothing", () => {
    expect(html(<FairChallenges items={[]} />)).toBe("");
  });

  test("the panel, its title and hint, and a list that the reveal engine cascades", () => {
    const out = html(<FairChallenges items={items} />);
    expect(out).toContain('data-game-fair-challenges=""');
    expect(out).toContain(`>${d.fair.challengesTitle}</h2>`);
    expect(out).toContain(d.fair.challengesHint);
    expect(out).toContain('<ul data-admin-reveal="rows"');
    expect(out.match(/<li /g)).toHaveLength(4);
  });

  test("met: marked done, a check and „Ispunjeno“", () => {
    const out = html(<FairChallenges items={[items[0]]} />);
    expect(out).toContain('data-challenge="skenovi_10" data-done=""');
    expect(out).toContain("lucide-check");
    expect(out).toContain("Ispunjeno");
    expect(out).toContain("aria-valuenow=\"10\"");
  });

  test("missed: marked, grey, with its own words and a bar of what was reached", () => {
    const out = html(<FairChallenges items={[items[1]]} />);
    expect(out).toMatch(/data-challenge="prestigni_prepodne" data-missed=""/);
    expect(out).not.toContain("data-done");
    expect(out).toContain("Prestigni jučerašnje prepodne: 80 do 12:00");
    expect(out).toContain("Rok je prošao");
    expect(out).toContain("bg-[var(--admin-text-muted)]");
    expect(out).toContain(`transform:scaleX(${29 / 80})`);
  });

  test("in progress: „value od target“ and a bar with the right values", () => {
    const out = html(<FairChallenges items={[items[2]]} />);
    expect(out).not.toContain("data-done");
    expect(out).not.toContain("data-missed");
    expect(out).toContain(">17 od 50<");
    expect(out).toContain('role="progressbar" aria-label="50 skenova danas" aria-valuemin="0" aria-valuemax="50" aria-valuenow="17" aria-valuetext="17 od 50"');
    expect(out).toContain("transform:scaleX(0.34)");
    // N10 — the fill of a challenge in progress is the energy ink, readable on both surfaces.
    expect(out).toContain("bg-[var(--admin-energy-ink)]");
    expect(out).not.toContain("--admin-nav-line");
  });

  test("a value above the target holds the bar full and the value inside the range", () => {
    const out = html(<FairChallenges items={[{ id: "skenovi_100", value: 140, target: 100, done: true, missed: false }]} />);
    expect(out).toContain("transform:scaleX(1)");
    expect(out).toContain('aria-valuenow="100"');
  });

  test("a target of zero has no bar: the number of open items stands alone", () => {
    const out = html(<FairChallenges items={[items[3]]} />);
    expect(out).toContain('data-challenge="hitni_na_nuli"');
    expect(out).toContain(d.fair.challenges.hitni_na_nuli);
    expect(out).not.toContain("progressbar");
    expect(out).toMatch(/tabular-nums">2<\/span>/);
  });

  test("every challenge of the contract has a name", () => {
    const all: FairChallenge[] = FAIR_CHALLENGE_IDS.map((id) => ({ id, value: 1, target: 2, done: false, missed: false }));
    const out = html(<FairChallenges items={all} />);
    expect(out.match(/<li /g)).toHaveLength(FAIR_CHALLENGE_IDS.length);
    expect(out).not.toMatch(/\{\w+\}/);
  });
});

describe("the whole display", () => {
  test("no emoji and no unreplaced placeholder anywhere", () => {
    const out = [
      html(<XpChip operator={OPERATOR} onOpen={noop} />),
      html(<OperatorRow operator={{ ...OPERATOR, complete: false, since: Date.UTC(2026, 8, 3) }} streak={STREAK} onOpen={noop} />),
      html(<BossBar boss={{ kind: "alive", hp: 5, hpMax: 9, share: 5 / 9, returned: true }} event={{ kind: "hit", damage: 1, mine: true, seq: 1 }} />),
      html(<ComboMeter combo={{ chain: 4, multiplier: 2, toNext: 1, lastAt: 1, expiresAt: 2 }} now={1} />),
    ].join("");
    expect(out).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(out).not.toMatch(/\{\w+\}/);
  });
});
