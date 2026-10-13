import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { badgeDef } from "@/lib/admin-v2/game/badges";
import { ceremonyQueue, ceremonySeconds } from "@/lib/admin-v2/game/ceremonies";
import { BADGE_ART } from "@/lib/admin-v2/game/medal-art";
import type { CeremonyEnv, CeremonyEvent, CeremonyItem } from "@/lib/admin-v2/game/types";
import { ADMIN_LAYER_MAX } from "@/lib/admin-v2/motion";
import { adminGameSr as d } from "@/lib/i18n/sr/admin-game";

vi.mock("convex/react", () => ({ useQuery: () => undefined, useMutation: () => () => undefined, useConvex: () => ({}) }));

import { CauseChain, SPARK } from "./cause-chain";
import { CeremonyLayer, CeremonyStage, ceremonyAdvance, ceremonyMedal, ceremonyRoute, ceremonyText, type CeremonyEntry } from "./ceremony-layer";
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

  test("a hidden tab gets the calm toast, not a layer that plays to nobody", () => {
    const route = ceremonyRoute(plan(LEVEL), { ...ENV, hidden: true });
    expect(route.layer).toEqual([]);
    expect(route.toasts).toEqual([{ key: "level:8", title: "Novi nivo: 8", body: "Operater · nivo 8", personal: true }]);
    expect(ceremonyRoute(plan(LEVEL), { ...ENV, hidden: false }).layer).toHaveLength(1);
  });

  test("what does not fit in two is one line that says how many", () => {
    const route = ceremonyRoute(plan(LEVEL, BOSS, EPIC, BADGE), ENV);
    expect(route.layer).toHaveLength(2);
    expect(route.toasts).toEqual([{ key: expect.stringMatching(/^more:/), title: "I još 2", body: d.ceremony.moreBody, personal: true }]);
    // Only records left over, in the quiet mode: nothing.
    expect(ceremonyRoute({ show: [], rest: [item(RECORD)], seen: [] }, { ...ENV, quiet: true }).toasts).toEqual([]);
  });
});

describe("the second ceremony of a row asks the screen again when its turn comes", () => {
  const entries = (...events: CeremonyEvent[]): CeremonyEntry[] => events.map((event) => ({ item: item(event), size: item(event).size }));
  const row = entries(LEVEL, BOSS);

  test("a free screen: the first is the layer, the second waits for its turn", () => {
    const first = ceremonyAdvance(row, ENV);
    expect(first.show?.item.key).toBe("level:8");
    expect(first.show?.size).toBe("big");
    expect(first.rest.map((entry) => entry.item.key)).toEqual(["boss:2026-10-13"]);
    expect(first.toasts).toEqual([]);
  });

  test("focus goes into a field before the second: the second is a toast with the same words, not a layer", () => {
    const first = ceremonyAdvance(row, ENV);
    const second = ceremonyAdvance(first.rest, { ...ENV, editable: true });
    expect(second.show).toBeNull();
    expect(second.rest).toEqual([]);
    expect(second.toasts).toEqual([{ key: "boss:2026-10-13", title: d.ceremony.boss, body: d.ceremony.bossBody, personal: true }]);
  });

  test("a dialog that opened before the second, and a tab that went hidden, do the same", () => {
    for (const now of [{ ...ENV, modal: true }, { ...ENV, hidden: true }]) {
      const turn = ceremonyAdvance(entries(BOSS), now);
      expect(turn.show).toBeNull();
      expect(turn.toasts.map((toast) => toast.key)).toEqual(["boss:2026-10-13"]);
    }
  });

  test("every entry that may not show is its own toast, in order, and the turn goes on past it", () => {
    const calm = ceremonyAdvance(entries(BOSS, LEVEL), { ...ENV, editable: true });
    expect(calm.show).toBeNull();
    expect(calm.rest).toEqual([]);
    expect(calm.toasts.map((toast) => toast.key)).toEqual(["boss:2026-10-13", "level:8"]);
    // On a phone both are cards, so the first one shows and the second waits.
    const phone = ceremonyAdvance(entries(RECORD, BOSS), { ...ENV, phone: true });
    expect(phone.show?.item.key).toBe("record:hour:test");
    expect(phone.rest.map((entry) => entry.item.key)).toEqual(["boss:2026-10-13"]);
  });

  test("the quiet mode: a record says nothing, a level is its toast", () => {
    const turn = ceremonyAdvance(entries(RECORD, LEVEL), { ...ENV, quiet: true });
    expect(turn.show).toBeNull();
    expect(turn.toasts.map((toast) => toast.key)).toEqual(["level:8"]);
    expect(ceremonyAdvance(entries(RECORD), { ...ENV, quiet: true })).toEqual({ show: null, rest: [], toasts: [] });
  });

  test("the size is read again too: a window that became a phone gets the card", () => {
    expect(ceremonyAdvance(entries(LEVEL), { ...ENV, phone: true }).show?.size).toBe("card");
  });

  test("the queue it is given is not changed", () => {
    const copy = JSON.stringify(row);
    ceremonyAdvance(row, { ...ENV, editable: true });
    expect(JSON.stringify(row)).toBe(copy);
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

  test("the beaten boss has a gold medal with the rim of the top rarity, not the common grey one; its badge keeps its own rarity", () => {
    const boss = ceremonyMedal(item(BOSS));
    expect(boss.gold).toBe(true);
    expect(boss.rarity).toBe("legendarna");
    expect(boss.rarity).not.toBe(badgeDef("sef_je_pao").rarity);
    expect(boss.art).toBe(BADGE_ART.sef_je_pao);
    // Only the boss is gold.
    for (const event of [LEVEL, RANK, BADGE, EPIC, RECORD]) expect(ceremonyMedal(item(event)).gold).toBeUndefined();
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

  test("a ceremony never draws a 3D medal (no canvas of the kit, no scene asked for): the 2D medal with one sheen", () => {
    const big = stage(RANK, "big");
    expect(big).not.toContain("data-admin-stage");
    expect(big).not.toContain("data-medal-stage");
    expect(big.match(/data-ceremony-sheen/g)).toHaveLength(1);
    expect(stage(BADGE, "card")).not.toContain("data-ceremony-sheen");
  });

  test("the boss has the gold medal in the markup too: a gold face, the rim of the top rarity, no holographic face", () => {
    const boss = stage(BOSS, "big");
    expect(boss).toContain('data-medal="legendarna"');
    expect(boss).toContain("#f2c94c");
    expect(boss).not.toContain("conic-gradient");
    expect(stage(EPIC, "big")).toContain("conic-gradient");
    expect(stage(EPIC, "big")).not.toContain("#f2c94c");
  });

  test("with nothing to celebrate the layer is only its polite live region", () => {
    const markup = renderToStaticMarkup(<GameProvider mode="off"><CeremonyLayer /></GameProvider>);
    expect(markup).toBe(`<p role="status" aria-live="polite" aria-label="${d.ceremony.region}" data-ceremony-announce="" class="sr-only"></p>`);
  });

  test("the spark of gained XP is a layer without pointer events, hidden from a screen reader", () => {
    const markup = renderToStaticMarkup(<GameProvider mode="off"><CauseChain /></GameProvider>);
    expect(markup).toBe('<div data-admin-spark-layer="" aria-hidden="true" class="pointer-events-none fixed inset-0 z-[71] overflow-hidden"></div>');
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

  test("the turn of each ceremony reads the screen again, and the layer takes no 3D medal", () => {
    expect(source).toContain("ceremonyAdvance(queue.current, readEnv())");
    expect(source).toContain('document.visibilityState !== "visible"');
    expect(source).not.toMatch(/medal-stage|MedalStage|warmMedalScene|medalSceneReady/);
  });

  test("a ceremony tells the screen: the signal on appear and clear, the lit edge for a big one, both taken back on cleanup", () => {
    expect(source).toContain("ceremonySignal.set(entry.size)");
    expect(source).toContain("ceremonySignal.set(null)");
    expect(source).toContain('closest<HTMLElement>(".admin-v1")');
    expect(source).toContain('setAttribute("data-admin-celebrating", "")');
    expect(source).toContain('removeAttribute("data-admin-celebrating")');
  });

  test("the durations come from the tokens: the words, the punch of the medal, the settle and the ring", () => {
    expect(source).toContain("ADMIN_CEREMONY.words.in");
    expect(source).toContain("ADMIN_CEREMONY.words.out");
    expect(source).toContain("ADMIN_CEREMONY.medal.from");
    expect(source).toContain("ADMIN_CEREMONY.medal.over");
    expect(source).toContain("ADMIN_REVEAL_EASE.ignite");
    expect(source).not.toMatch(/duration: 0\.\d/);
    // Only transform, opacity and the canvas move.
    expect(source).not.toMatch(/\b(width|height|top|left|margin)\s*:\s*[\d"']/);
  });
});
