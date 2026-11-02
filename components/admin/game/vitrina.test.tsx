import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { BADGE_IDS, RARITIES } from "@/lib/admin-v2/game/ids";
import { BADGES } from "@/lib/admin-v2/game/badges";
import { BADGE_ART } from "@/lib/admin-v2/game/medal-art";
import type { BadgeState, OperatorView } from "@/lib/admin-v2/game/types";
import { adminGameSr as d } from "@/lib/i18n/sr/admin-game";
import { Medal2D } from "./medal-2d";
import { Vitrina, VitrinaBody } from "./vitrina";

// ADMIN v3 V4 — the Vitrina without a DOM: what the server sends (the list of the
// badges with their full names, the date of the won ones, the condition and the
// progress of the locked ones, the 2D medal in place of the scene) and that the
// React side never imports `three`. The scene needs WebGL: it is proven by the
// frames of the step (output/playwright/admin-v3/V4), its pure rules by medal-art.test.ts.

const FIRST_AT = Date.UTC(2026, 9, 12, 10, 0);
const LAST_AT = Date.UTC(2026, 9, 13, 8, 0);

/** TEST data: two badges won (one of them three times), one locked with progress, the rest locked. */
const badges: BadgeState[] = BADGES.map((def) => {
  if (def.id === "prvi_korak") return { ...def, earnedAt: FIRST_AT };
  if (def.id === "sef_je_pao") return { ...def, earnedAt: LAST_AT, count: 3 };
  if (def.id === "stotka") return { ...def, earnedAt: null, progress: { value: 40, target: 100 } };
  return { ...def, earnedAt: null };
});

const operator: OperatorView = { level: 12, rank: "dispecer", xp: 5000, into: 100, span: 400, share: 0.25, todayXp: 60, since: null, complete: true };

const body = (props: Partial<Parameters<typeof VitrinaBody>[0]> = {}) => renderToStaticMarkup(<VitrinaBody badges={badges} operator={operator} {...props} />);
const buttonOf = (markup: string, id: string) => markup.match(/<button[^>]*>/g)?.find((tag) => tag.includes(`data-badge="${id}"`)) ?? "";

describe("the list of the badges", () => {
  test("every one of the twenty badges is a button with its full name, rarity and state", () => {
    const markup = body();
    expect(BADGE_IDS).toHaveLength(20);
    expect(markup.match(/<button/g)).toHaveLength(20);
    for (const id of BADGE_IDS) {
      const tag = buttonOf(markup, id);
      expect(tag, id).toContain('type="button"');
      expect(tag, id).toContain(`aria-label="${d.badges[id].name}. `);
      expect(markup, id).toContain(d.badges[id].name);
    }
    const rarity = BADGES.find((def) => def.id === "stotka")?.rarity ?? "obicna";
    expect(buttonOf(markup, "stotka")).toContain(`. ${d.rarity[rarity]}. `);
  });

  test("a won badge says the date, a locked one the condition", () => {
    const markup = body();
    expect(buttonOf(markup, "prvi_korak")).toContain("Osvojena 12. 10. 2026.");
    expect(buttonOf(markup, "prvi_korak")).not.toContain("data-locked");
    expect(buttonOf(markup, "kurir")).toContain(`Zaključano. Uslov: ${d.badges.kurir.condition}`);
    expect(buttonOf(markup, "kurir")).toContain('data-locked=""');
  });

  test("each button is a target of at least 44 px and carries a 2D medal of its own", () => {
    const markup = body();
    for (const id of BADGE_IDS) expect(buttonOf(markup, id), id).toContain("min-h-11");
    // Twenty in the grid and the one of the stage fallback.
    expect(markup.match(/data-medal="/g)).toHaveLength(21);
  });

  test("both groups and both notes are there, the fair note under the fair group", () => {
    const markup = body();
    expect(markup).toContain(d.vitrina.groupPersonal);
    expect(markup).toContain(d.vitrina.groupFair);
    expect(markup).toContain(d.vitrina.fairNote);
    expect(markup).toContain(d.vitrina.localNote);
    expect(markup.indexOf(d.vitrina.groupFair)).toBeGreaterThan(markup.indexOf(d.vitrina.groupPersonal));
    expect(markup.indexOf(d.vitrina.fairNote)).toBeGreaterThan(markup.indexOf(d.vitrina.groupFair));
    expect(markup.indexOf(d.vitrina.localNote)).toBeGreaterThan(markup.indexOf(d.vitrina.fairNote));
  });

  test("the header counts the won badges and names the rank and the level", () => {
    const markup = body();
    expect(markup).toContain("Osvojeno 2 od 20");
    expect(markup).toContain("Dispečer · Nivo 12");
    expect(body({ operator: null })).not.toContain("data-vitrina-operator");
  });
});

describe("the selected badge", () => {
  test("the last badge won is selected at first: aria-pressed on that one only", () => {
    const markup = body();
    expect(buttonOf(markup, "sef_je_pao")).toContain('aria-pressed="true"');
    for (const id of BADGE_IDS.filter((other) => other !== "sef_je_pao")) expect(buttonOf(markup, id), id).toContain('aria-pressed="false"');
    expect(markup).toContain('<h3 data-vitrina-name="" class="text-base font-semibold text-[var(--admin-text)]">Šef je pao</h3>');
  });

  test("a badge won more than once says how many times and since when", () => {
    expect(body()).toContain("Osvojena 3 puta, prvi put 13. 10. 2026.");
  });

  test("with nothing won the first badge is selected", () => {
    const none = badges.map((badge) => ({ ...badge, earnedAt: null, count: undefined }));
    const markup = renderToStaticMarkup(<VitrinaBody badges={none} operator={null} />);
    expect(buttonOf(markup, "prvi_korak")).toContain('aria-pressed="true"');
    expect(markup).toContain(">Prvi korak</h3>");
  });

  test("a locked badge shows its condition and its progress as text and as a bar", () => {
    const markup = body({ selectedId: "stotka" });
    expect(buttonOf(markup, "stotka")).toContain('aria-pressed="true"');
    expect(markup).toContain(`<p class="text-sm font-semibold text-[var(--admin-text)]">${d.vitrina.locked}</p>`);
    expect(markup).toContain(`Uslov: ${d.badges.stotka.condition}</p>`);
    expect(markup).toContain("40 od 100");
    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain('aria-valuenow="40"');
    expect(markup).toContain('aria-valuemax="100"');
    expect(markup).toContain("scaleX(0.4)");
  });

  test("a locked badge without a progress has no bar", () => {
    const markup = body({ selectedId: "kurir" });
    expect(markup).toContain(`Uslov: ${d.badges.kurir.condition}</p>`);
    expect(markup).not.toContain("progressbar");
  });

  test("the hint of the scene is under the medal", () => {
    expect(body()).toContain(d.vitrina.sceneHint);
  });
});

describe("what the server sends for the scene", () => {
  test("the 2D medal stands in the place of the scene; there is no canvas", () => {
    const markup = body();
    expect(markup).toContain('data-stage-fallback=""');
    expect(markup).toContain('data-stage-state="flat"');
    expect(markup).not.toContain("<canvas");
    // The fallback holds the medal of the selected badge (the last one won) with its rarity.
    const rarity = BADGES.find((def) => def.id === "sef_je_pao")?.rarity;
    const fallback = markup.slice(markup.indexOf('data-stage-fallback=""'));
    expect(fallback.slice(0, fallback.indexOf('data-stage-mount=""'))).toContain(`data-medal="${rarity}"`);
    const rare = renderToStaticMarkup(<VitrinaBody badges={badges} operator={null} selectedId="kurir" />);
    expect(rare.slice(rare.indexOf('data-stage-fallback=""'), rare.indexOf('data-stage-mount=""'))).toContain('data-locked=""');
  });

  test("the scene is hidden from assistive technology: the medal is aria-hidden and the grid is the text", () => {
    const markup = body();
    expect(markup).toMatch(/<span aria-hidden="true" data-medal="/);
  });

  test("a closed dialog draws nothing; an open one does not break on the server", () => {
    expect(() => renderToStaticMarkup(<Vitrina open={false} onOpenChange={() => undefined} badges={badges} operator={operator} />)).not.toThrow();
    expect(() => renderToStaticMarkup(<Vitrina open onOpenChange={() => undefined} badges={badges} operator={null} />)).not.toThrow();
  });
});

describe("Medal2D", () => {
  const art = BADGE_ART.kurir;

  test("every rarity carries data-medal, aria-hidden and the paths of the sign", () => {
    for (const rarity of RARITIES) {
      const markup = renderToStaticMarkup(<Medal2D art={art} rarity={rarity} className="size-12" />);
      expect(markup, rarity).toContain(`data-medal="${rarity}"`);
      expect(markup, rarity).toContain('aria-hidden="true"');
      expect(markup, rarity).toContain('viewBox="0 0 100 100"');
      expect(markup, rarity).toContain("size-12");
      expect(markup, rarity).not.toContain("data-locked");
      expect(markup.match(/<path /g), rarity).toHaveLength(art.paths.length);
      expect(markup, rarity).not.toContain("tabindex");
      expect(markup, rarity).not.toContain("animate");
    }
  });

  test("the material is read in the face: matte, linear, conic, conic with a ring", () => {
    const face = (rarity: (typeof RARITIES)[number]) => renderToStaticMarkup(<Medal2D art={art} rarity={rarity} />);
    // V5 (RV move 5): the common face is no longer a flat fill but a faint matte gradient, so it has depth on
    // a light surface; it is still the plainest of the four (no metal, no hologram).
    expect(face("obicna")).toContain("linear-gradient");
    expect(face("obicna")).not.toContain("conic-gradient");
    expect(face("retka")).toContain("linear-gradient");
    expect(face("retka")).not.toContain("conic-gradient");
    expect(face("epska")).toContain("conic-gradient");
    expect(face("legendarna")).toContain("conic-gradient");
    expect(face("legendarna")).toContain("inset_0_0_0_1px");
    expect(face("epska")).not.toContain("inset_0_0_0_1px");
  });

  test("both themes are in the markup, and a locked medal is a dark silhouette without a gradient", () => {
    const open = renderToStaticMarkup(<Medal2D art={art} rarity="epska" />);
    expect(open).toContain("--mb-l:");
    expect(open).toContain("--mb-d:");
    const locked = renderToStaticMarkup(<Medal2D art={art} rarity="epska" locked />);
    expect(locked).toContain('data-locked=""');
    expect(locked).toContain('data-medal="epska"');
    expect(locked).not.toContain("gradient");
    expect(locked).not.toContain("inset_0_0_0_1px");
  });
});

describe("the React side never imports three", () => {
  const source = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

  test("medal-stage.tsx, vitrina.tsx and medal-2d.tsx reach the scene only through types and import()", () => {
    for (const file of ["components/admin/game/medal-stage.tsx", "components/admin/game/vitrina.tsx", "components/admin/game/medal-2d.tsx"]) {
      const text = source(file);
      expect(text, file).not.toMatch(/from "three/);
      expect(text, file).not.toMatch(/^import (?!type)[^;]*from "[^"]*\/(stage|post|picking|particles)"/m);
      expect(text, file).not.toMatch(/^import (?!type)[^;]*scenes\//m);
    }
    expect(source("components/admin/game/medal-stage.tsx")).toContain('import("@/components/admin/three/scenes/medal-scene")');
  });

  test("the stage is asked for at once, for a dialog, below 768 px it stays 2D", () => {
    const text = source("components/admin/game/medal-stage.tsx");
    expect(text).toContain("eager");
    expect(text).toContain("exclusive");
    expect(text).toContain("FLAT_BELOW = 768");
  });
});

describe("the scene gives every GPU resource to the stage", () => {
  const lines = readFileSync(join(process.cwd(), "components/admin/three/scenes/medal-scene.ts"), "utf8").split("\n");

  test("every geometry, material and texture is made inside stage.track(…)", () => {
    const made = lines.flatMap((line, at) => (/new THREE\.\w*(Geometry|Material|Texture)\(/.test(line) ? [{ line, before: lines[at - 1] ?? "" }] : []));
    expect(made.length).toBeGreaterThanOrEqual(3);
    const untracked = made.filter(({ line, before }) => !/stage\.track\(/.test(line) && !/stage\.track\($/.test(before.trim()));
    expect(untracked).toEqual([]);
  });

  test("it takes back what it listens to and imports `three` itself", () => {
    const text = lines.join("\n");
    expect(text).toMatch(/^import \* as THREE from "three";/m);
    for (const name of ["pointerdown", "pointermove", "pointerup", "pointercancel", "pointerleave"]) expect(text).toContain(`"${name}"`);
    for (const call of ["removeEventListener(name", "composer?.dispose()", "setPointerCapture", "releasePointerCapture", "stage.onFrame(", "stage.onTheme(", "stage.onResize("]) expect(text, call).toContain(call);
    // The scene never touches the background: the kit paints it with the colour of the surface.
    expect(text).not.toContain("scene.background");
  });
});
