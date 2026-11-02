import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import type { GameEffect } from "@/lib/admin-v2/game/engine";
import { BADGE_IDS } from "@/lib/admin-v2/game/ids";
import { adminGameSr as d } from "@/lib/i18n/sr/admin-game";

vi.mock("convex/react", () => ({ useQuery: () => undefined, useMutation: () => () => undefined, useConvex: () => ({}) }));

import { GAME_FIXTURE_NOW, PREVIEW_GAME, gameFixture } from "./game-fixtures";
import { createPreviewGame } from "./game-preview";
import { GameBoss, GameChip, GameLayers, GameOperator, GameTeam } from "./game-parts";
import { GameProvider } from "./game-provider";

// ADMIN v3 V4 — the TEST game of the dev previews: it is fed to the real
// engine, so what a preview shows is worked out, and it carries TEST people only.

function preview(variant: Parameters<typeof gameFixture>[0] = "nivo") {
  const game = createPreviewGame(gameFixture(variant));
  const effects: GameEffect[] = [];
  game.store.onEffect((effect) => effects.push(effect));
  const plans = () => effects.flatMap((effect) => (effect.type === "ceremony" ? [effect.plan] : []));
  return { ...game, effects, plans, view: () => game.store.getSnapshot().view };
}

describe("the TEST game", () => {
  test("starts as an operator of level 7 with a streak, a boss and a team, and celebrates nothing", () => {
    const game = preview();
    expect(game.effects).toEqual([]);
    const view = game.view();
    expect(view.operator).toMatchObject({ level: 7, rank: "operater", into: 680, span: 700, todayXp: 70 });
    expect(view.streak).toMatchObject({ count: 4, flame: 2, todayDone: false });
    expect(view.boss).toEqual({ kind: "alive", hp: 20, hpMax: 20, share: 1, returned: false });
    expect(view.team?.rows.map((row) => row.name)).toEqual(["TEST Operater A", "TEST Operater B", "TEST Operater C"]);
    // A combo of five this morning took the first place from the one who held it yesterday.
    expect(view.team?.rows[0]).toMatchObject({ me: true, rank: 1, medal: 1, bestChain: 5, move: 1 });
    expect(view.team?.rows[1]).toMatchObject({ rank: 2, bestChain: 3, move: -1 });
    expect(view.team?.rows[2]).toMatchObject({ rank: 3, move: 0 });
    expect(view.badges).toHaveLength(BADGE_IDS.length);
    expect(view.badges.filter((badge) => badge.earnedAt !== null).map((badge) => badge.id).sort()).toEqual(["inbox_nula", "operater", "prvi_korak", "prvi_u_nedelji", "sef_je_pao", "sef_pre_podne", "stotka"]);
  });

  test("the clock stands until the page is in the browser (the server and the first client render agree)", () => {
    const game = preview();
    expect(game.store.getSnapshot().now).toBe(GAME_FIXTURE_NOW);
    expect(createPreviewGame(gameFixture()).store.getSnapshot().view).toEqual(game.view());
  });

  test("one solved item: XP, a hit on the boss and a new level", () => {
    const game = preview();
    game.controls.act("resolved");
    expect(game.effects.map((effect) => effect.type)).toEqual(["gain", "ceremony", "boss"]);
    expect(game.effects[0]).toMatchObject({ xp: 30 });
    // My row is in my journal of the team table too.
    expect(game.view().team?.rows[0]).toMatchObject({ me: true, actions: 22 });
    expect(game.plans()[0].show[0]).toMatchObject({ key: "level:8", size: "big" });
    expect(game.effects[2]).toMatchObject({ event: { kind: "hit", damage: 3, mine: true } });
    expect(game.view()).toMatchObject({ operator: { level: 8, into: 10 }, boss: { hp: 17, hpMax: 20 } });
  });

  test("three quick actions are a combo ×2", () => {
    const game = preview();
    game.controls.act("reply");
    game.controls.act("task");
    game.controls.act("resolved");
    expect(game.view().combo).toMatchObject({ chain: 3, multiplier: 2 });
  });

  test("the operator one item short of a new rank: one ceremony for the rank and its epic badge", () => {
    const game = preview("rang");
    expect(game.view().operator).toMatchObject({ level: 10, rank: "operater" });
    game.controls.act("resolved");
    expect(game.plans()).toHaveLength(1);
    expect(game.plans()[0].show).toHaveLength(1);
    expect(game.plans()[0].show[0]).toMatchObject({ key: "level:11", size: "big", alsoBadge: "dispecer", event: { rank: "dispecer", rankUp: true } });
  });

  test("the tenth delivery is the badge „Kurir“ (rare: a card)", () => {
    const game = preview();
    game.controls.act("delivery");
    const items = game.plans().flatMap((plan) => plan.show);
    expect(items.map((item) => [item.key, item.size])).toContainEqual(["badge:kurir", "card"]);
  });

  test("the backlog brought to zero: the boss falls, two ceremonies at most and the rest in one line", () => {
    const game = preview();
    game.controls.clearBacklog();
    const boss = game.plans().find((plan) => plan.show.some((item) => item.event.kind === "boss"));
    expect(boss?.show).toHaveLength(2);
    expect(boss?.show[0].event.kind).toBe("boss");
    // Four working days with a beaten boss were on record: today makes the perfect week (legendary).
    expect(boss?.show[1].key).toBe("badge:savrsena_nedelja");
    expect(boss?.rest.map((item) => item.key).sort()).toEqual(["badge:nula_hitnih", "badge:pet_u_nizu"]);
    expect(game.view().boss.kind).toBe("down");
    expect(game.view().streak).toMatchObject({ count: 5, todayDone: true, flame: 3 });
  });

  test("new backlog and a reset", () => {
    const game = preview();
    game.controls.backlog();
    expect(game.view().boss).toMatchObject({ hp: 23, hpMax: 23 });
    game.controls.act("resolved");
    game.controls.reset();
    expect(game.view()).toMatchObject({ operator: { level: 7 }, boss: { hp: 20, hpMax: 20 } });
  });

  test("a new operator has level 1, no streak and no badge", () => {
    const view = preview("pocetak").view();
    expect(view.operator).toMatchObject({ level: 1, rank: "pripravnik", xp: 0 });
    expect(view.streak).toMatchObject({ count: 0, best: 0, brokenOn: null });
    expect(view.badges.every((badge) => badge.earnedAt === null)).toBe(true);
  });

  test("the fixture carries TEST people only", () => {
    const fixture = gameFixture();
    expect(fixture.team.members.every((member) => member.id.startsWith("preview-admin-"))).toBe(true);
    expect(JSON.stringify(fixture)).not.toMatch(/@|SMK-|SML-/);
  });
});

describe("the game in a preview frame", () => {
  const html = renderToStaticMarkup(
    <GameProvider mode="preview" fixture={PREVIEW_GAME}>
      <GameChip />
      <GameOperator />
      <GameBoss />
      <GameTeam variant="strip" href="/admin/tim" />
      <GameLayers />
    </GameProvider>,
  );

  test("the chip, the operator row, the boss and the team strip are drawn from the TEST game", () => {
    expect(html).toContain('data-admin-xp-chip=""');
    expect(html).toContain(`aria-label="${d.operator.chip.replace("{rank}", "Operater").replace("{level}", "7")}"`);
    expect(html).toContain('data-admin-operator=""');
    expect(html).toContain('data-game-boss="alive"');
    expect(html).toContain('data-game-team="strip"');
    expect(html).toContain(">TEST Operater A<");
  });

  test("a preview without a TEST game has no game (the fixtures never reach a frame that did not ask for them)", () => {
    expect(renderToStaticMarkup(<GameProvider mode="preview"><GameChip /><GameOperator /></GameProvider>)).toBe("");
  });

  test("the layers of the game add no tab stop and no visible text while nothing happens", () => {
    const layers = html.slice(html.indexOf("data-admin-spark-layer") - 5);
    expect(layers).not.toMatch(/<button|<a |tabindex/);
  });

  test("outside a frame every part draws an empty game", () => {
    expect(renderToStaticMarkup(<><GameChip /><GameOperator /><GameTeam variant="strip" /><GameLayers /></>)).toBe("");
    expect(renderToStaticMarkup(<GameBoss />)).toContain('data-game-boss="unavailable"');
  });
});
