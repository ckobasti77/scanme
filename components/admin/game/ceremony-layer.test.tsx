import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { ceremonyQueue, ceremonySeconds } from "@/lib/admin-v2/game/ceremonies";
import type { CeremonyEnv, CeremonyEvent, CeremonyItem } from "@/lib/admin-v2/game/types";
import { ADMIN_LAYER_MAX } from "@/lib/admin-v2/motion";
import { adminGameSr as d } from "@/lib/i18n/sr/admin-game";

vi.mock("convex/react", () => ({ useQuery: () => undefined, useMutation: () => () => undefined, useConvex: () => ({}) }));

import { CauseChain, SPARK } from "./cause-chain";
import { CeremonyLayer, CeremonyStage, ceremonyMedal, ceremonyRoute, ceremonyText } from "./ceremony-layer";
import { GameProvider } from "./game-provider";

// ADMIN v3 V4 — the ceremonies: where each one goes (over the screen, into a
// calm toast, nowhere) and what the layer is in the markup.

const AT = Date.UTC(2026, 9, 13, 8, 0);
const LEVEL: CeremonyEvent = { kind: "level", level: 8, rank: "operater", rankUp: false, at: AT };
const RANK: CeremonyEvent = { kind: "level", level: 11, rank: "dispecer", rankUp: true, at: AT };
const BOSS: CeremonyEvent = { kind: "boss", dayKey: "2026-10-13", at: AT };
const BADGE: CeremonyEvent = { kind: "badge", badge: "kurir", rarity: "retka", at: AT };
const EPIC: CeremonyEvent = { kind: "badge", badge: "sto_skenova", rarity: "epska", at: AT };
const RECORD: CeremonyEvent = { kind: "record", key: "hour:test", title: "Novi rekord sata: 57 skenova u 14 h", at: AT };

const plan = (...events: CeremonyEvent[]) => ceremonyQueue(events, new Set());
const item = (event: CeremonyEvent): CeremonyItem => plan(event).show[0];
const ENV: CeremonyEnv = { quiet: false, reducedMotion: false, editable: false, modal: false, phone: false };

describe("where a ceremony goes", () => {
  test("on a free desktop screen it is over the screen: big for a level, a card for a common badge and a record", () => {
    const route = ceremonyRoute(plan(LEVEL, BADGE), ENV);
    expect(route.toasts).toEqual([]);
    expect(route.layer.map((entry) => [entry.item.key, entry.size])).toEqual([["level:8", "big"], ["badge:kurir", "card"]]);
    expect(ceremonyRoute(plan(RECORD), ENV).layer.map((entry) => entry.size)).toEqual(["card"]);
    expect(ceremonyRoute(plan(EPIC), ENV).layer.map((entry) => entry.size)).toEqual(["big"]);
  });

  test("the quiet mode turns the ceremony off and leaves one calm toast", () => {
    const one = ceremonyRoute(plan(LEVEL), { ...ENV, quiet: true });
    expect(one.layer).toEqual([]);
    expect(one.toasts).toEqual([{ key: "level:8", title: "Novi nivo: 8", body: "Operater · nivo 8", personal: true }]);
    // Several at once are still one line: the most important is named, the others are counted.
    const many = ceremonyRoute(plan(LEVEL, BOSS, EPIC, BADGE, RECORD), { ...ENV, quiet: true });
    expect(many.layer).toEqual([]);
    expect(many.toasts).toEqual([{ key: "level:8", title: "Novi nivo: 8", body: `I još 3. ${d.ceremony.moreBody}`, personal: true }]);
  });

  test("a record says nothing in the quiet mode, as before", () => {
    expect(ceremonyRoute(plan(RECORD), { ...ENV, quiet: true })).toEqual({ layer: [], toasts: [] });
  });

  test("reduced motion: a toast instead of the layer; a record keeps its v2 toast", () => {
    const route = ceremonyRoute(plan(BOSS, RECORD), { ...ENV, reducedMotion: true });
    expect(route.layer).toEqual([]);
    expect(route.toasts).toEqual([{ key: "boss:2026-10-13", title: d.ceremony.boss, body: `I još 1. ${d.ceremony.moreBody}`, personal: true }]);
    expect(ceremonyRoute(plan(RECORD), { ...ENV, reducedMotion: true }).toasts).toEqual([{ key: "record:hour:test", title: "Novi rekord", body: RECORD.kind === "record" ? RECORD.title : "", personal: false }]);
  });

  test("while focus is in a field or a dialog is open nothing goes over the screen", () => {
    for (const env of [{ ...ENV, editable: true }, { ...ENV, modal: true }]) {
      const route = ceremonyRoute(plan(RANK), env);
      expect(route.layer).toEqual([]);
      expect(route.toasts).toHaveLength(1);
    }
  });

  test("on a phone every ceremony is the card", () => {
    expect(ceremonyRoute(plan(RANK, BOSS), { ...ENV, phone: true }).layer.map((entry) => entry.size)).toEqual(["card", "card"]);
  });

  test("what does not fit in two is one line that says how many", () => {
    const route = ceremonyRoute(plan(LEVEL, BOSS, EPIC, BADGE), ENV);
    expect(route.layer).toHaveLength(2);
    expect(route.toasts).toEqual([{ key: expect.stringMatching(/^more:/), title: "I još 2", body: d.ceremony.moreBody, personal: true }]);
    // Only records left over, in the quiet mode: nothing.
    expect(ceremonyRoute({ show: [], rest: [item(RECORD)], seen: [] }, { ...ENV, quiet: true }).toasts).toEqual([]);
  });
});

describe("what a ceremony says and shows", () => {
  test("a level, a new rank, the boss, a badge and a record have their words", () => {
    expect(ceremonyText(item(LEVEL))).toEqual({ title: "Novi nivo: 8", body: "Operater · nivo 8" });
    expect(ceremonyText(item(RANK))).toEqual({ title: "Novi rang: Dispečer", body: "Dispečer · nivo 11" });
    expect(ceremonyText(item(BOSS))).toEqual({ title: d.ceremony.boss, body: d.ceremony.bossBody });
    expect(ceremonyText(item(EPIC))).toEqual({ title: "Nova značka: 100 skenova za sat", body: "Epska" });
    expect(ceremonyText(item(RECORD))).toEqual({ title: "Novi rekord", body: "Novi rekord sata: 57 skenova u 14 h" });
  });

  test("the medal follows the rank or the rarity of the badge", () => {
    expect(ceremonyMedal(item(RANK)).rarity).toBe("epska");
    expect(ceremonyMedal(item(BADGE)).rarity).toBe("retka");
    for (const event of [LEVEL, RANK, BOSS, BADGE, EPIC, RECORD]) expect(ceremonyMedal(item(event)).art.paths.length).toBeGreaterThan(0);
  });

  test("a ceremony is never longer than 1.8 s", () => {
    for (const size of ["big", "card"] as const) expect(ceremonySeconds(size).total).toBeLessThanOrEqual(1.8);
  });
});

describe("the layer in the markup", () => {
  const stage = (event: CeremonyEvent, size: "big" | "card") => renderToStaticMarkup(<CeremonyStage entry={{ item: item(event), size }} onDone={() => undefined} />);

  test("it is decoration: hidden from a screen reader, no pointer events, nothing that can take focus", () => {
    for (const markup of [stage(RANK, "big"), stage(BADGE, "card")]) {
      expect(markup).toMatch(/^<div data-admin-ceremony="(big|card)"[^>]*aria-hidden="true"[^>]*class="pointer-events-none fixed inset-0/);
      for (const focusable of ["<button", "<a ", "<input", "<select", "<textarea", "tabindex", "contenteditable", "autofocus"]) expect(markup).not.toContain(focusable);
    }
  });

  test("the big one has the medal, the words and the hint how to skip it; the card has the medal and the words", () => {
    const big = stage(RANK, "big");
    expect(big).toContain('data-ceremony-kind="level"');
    expect(big).toContain(">Novi rang: Dispečer<");
    expect(big).toContain(`>${d.ceremony.skipHint}<`);
    expect(big).toContain('data-medal="epska"');
    expect(big).toContain("data-ceremony-shade");
    const card = stage(BADGE, "card");
    expect(card).toContain(">Nova značka: Kurir<");
    expect(card).toContain('data-medal="retka"');
    expect(card).not.toContain("data-ceremony-shade");
  });

  test("the server never draws a 3D medal in a ceremony (no canvas of the kit, no scene asked for)", () => {
    expect(stage(RANK, "big")).not.toContain("data-admin-stage");
  });

  test("with nothing to celebrate the layer is only its polite live region", () => {
    const markup = renderToStaticMarkup(<GameProvider mode="off"><CeremonyLayer /></GameProvider>);
    expect(markup).toBe(`<p role="status" aria-live="polite" aria-label="${d.ceremony.region}" data-ceremony-announce="" class="sr-only"></p>`);
  });

  test("the spark of gained XP is a layer without pointer events, hidden from a screen reader", () => {
    const markup = renderToStaticMarkup(<GameProvider mode="off"><CauseChain /></GameProvider>);
    expect(markup).toBe('<div data-admin-spark-layer="" aria-hidden="true" class="pointer-events-none fixed inset-0 z-[65] overflow-hidden"></div>');
    // One flight, about a second; its first leg is inside the interaction layer.
    expect(SPARK.toBoss).toBeLessThanOrEqual(ADMIN_LAYER_MAX.interakcija);
    expect(SPARK.toBoss + SPARK.toChip).toBeLessThanOrEqual(1.1);
  });
});

describe("how a ceremony ends", () => {
  const source = readFileSync(join(process.cwd(), "components/admin/game/ceremony-layer.tsx"), "utf8");

  test("any key or click ends it, and that key or click still does its own work", () => {
    expect(source).toContain('window.addEventListener("keydown", skip, true)');
    expect(source).toContain('window.addEventListener("pointerdown", skip, true)');
    // The event is never stopped and focus is never moved.
    expect(source).not.toMatch(/preventDefault|stopPropagation|\.focus\(/);
  });
});
