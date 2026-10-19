import { describe, expect, test } from "vitest";
import { historyOp, searchOf } from "./history";
import { initialState, reduce, type Auto3dState } from "./state";
import { DEFAULT_URL_STATE, parseUrlState } from "./url-state";

const start = (): Auto3dState => initialState(DEFAULT_URL_STATE);

describe("URL i istorija /sajam/3d (E9)", () => {
  test("bez promene adrese nema ničega", () => {
    const s = start();
    expect(historyOp(s, reduce(s, { type: "hover", part: "karter" }), "")).toBe("none");
    expect(historyOp(s, reduce(s, { type: "explode", p: 1 }), "")).toBe("none");
  });

  test("otvaranje dela iz scene ili liste pravi novi unos", () => {
    const s = start();
    const canvas = reduce(s, { type: "select", part: "turbopunjac", origin: "canvas" });
    expect(searchOf(canvas)).toBe("?deo=turbopunjac");
    expect(historyOp(s, canvas, "")).toBe("push");
    expect(historyOp(s, reduce(s, { type: "select", part: "hladnjak", origin: "list" }), "")).toBe("push");
  });

  test("deo iz adrese (direktan link, nazad, napred) ne pravi unos", () => {
    const s = start();
    const fromUrl = reduce(s, { type: "url", url: parseUrlState({ deo: "hladnjak" }) });
    expect(historyOp(s, fromUrl, "?deo=hladnjak")).toBe("none");
    expect(historyOp(s, fromUrl, "")).toBe("replace");
  });

  test("zamena dela, grupa i režim menjaju trenutni unos", () => {
    const open = reduce(start(), { type: "select", part: "turbopunjac", origin: "list" });
    const other = reduce(open, { type: "select", part: "karter", origin: "list" });
    expect(historyOp(open, other, "?deo=turbopunjac")).toBe("replace");
    const group = reduce(start(), { type: "group", group: "kocnice" });
    expect(searchOf(group)).toBe("?grupa=kocnice");
    expect(historyOp(start(), group, "")).toBe("replace");
    const mode = reduce(start(), { type: "mode", mode: "lak" });
    expect(historyOp(start(), mode, "")).toBe("replace");
  });

  test("zatvaranje dela ide nazad samo ako je unos napravila strana", () => {
    const pushed = reduce(reduce(start(), { type: "select", part: "karter", origin: "canvas" }), { type: "pushed", pushed: true });
    const closed = reduce(pushed, { type: "close" });
    expect(closed.pushedPart).toBe(false);
    expect(historyOp(pushed, closed, "?deo=karter")).toBe("back");

    const direct = initialState(parseUrlState({ deo: "karter" }));
    expect(historyOp(direct, reduce(direct, { type: "close" }), "?deo=karter")).toBe("replace");
  });

  test("grupa drugog sistema zatvara deo i zamenjuje unos ako deo nije otvoren ovde", () => {
    const direct = initialState(parseUrlState({ deo: "karter" }));
    const next = reduce(direct, { type: "group", group: "kocnice" });
    expect(searchOf(next)).toBe("?grupa=kocnice");
    expect(historyOp(direct, next, "?deo=karter")).toBe("replace");
  });

  test("nekanonska adresa se ispravlja zamenom", () => {
    const s = initialState(parseUrlState({ grupa: "motor" }));
    expect(historyOp(s, s, "?grupa=motor&x=1")).toBe("replace");
  });
});
