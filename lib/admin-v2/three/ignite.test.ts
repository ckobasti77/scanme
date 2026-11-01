import { describe, expect, test } from "vitest";
import { ADMIN_STAGE_MOTION } from "@/lib/admin-v2/motion";
import { mayShade, sceneIntro, shadeRemainingMs, type ShadeInput } from "./ignite";

const normal: ShadeInput = {
  ignite: true,
  quiet: false,
  reducedMotion: false,
  mode: "full",
  excluded: false,
  webglKnown: null,
  enteredAt: 5000,
  now: 5010,
};
const input = (patch: Partial<ShadeInput>): ShadeInput => ({ ...normal, ...patch });

describe("mayShade", () => {
  test("the normal case: a full entrance, motion on, nothing known against 3D", () => {
    expect(mayShade(normal)).toBe(true);
    expect(mayShade(input({ webglKnown: true }))).toBe(true);
  });

  test("a page that did not ask for the light-up is never dimmed", () => {
    expect(mayShade(input({ ignite: false }))).toBe(false);
  });

  test("the quiet mode and reduced motion keep the full 2D picture", () => {
    expect(mayShade(input({ quiet: true }))).toBe(false);
    expect(mayShade(input({ reducedMotion: true }))).toBe(false);
  });

  test("only a full entrance: the short one and none do not dim", () => {
    expect(mayShade(input({ mode: "short" }))).toBe(false);
    expect(mayShade(input({ mode: "none" }))).toBe(false);
  });

  test("3D excluded by the choice, the width or a pin keeps the picture", () => {
    expect(mayShade(input({ excluded: true }))).toBe(false);
  });

  test("WebGL known to be missing keeps the picture; unknown does not", () => {
    expect(mayShade(input({ webglKnown: false }))).toBe(false);
    expect(mayShade(input({ webglKnown: null }))).toBe(true);
  });

  test("the deadline: no shade once igniteDeadline seconds have passed since the navigation", () => {
    const deadline = ADMIN_STAGE_MOTION.igniteDeadline * 1000;
    expect(mayShade(input({ now: normal.enteredAt + deadline - 1 }))).toBe(true);
    expect(mayShade(input({ now: normal.enteredAt + deadline }))).toBe(false);
    expect(mayShade(input({ now: normal.enteredAt + deadline + 400 }))).toBe(false);
  });
});

describe("shadeRemainingMs", () => {
  test("counts down from the navigation and stops at zero", () => {
    const deadline = ADMIN_STAGE_MOTION.igniteDeadline * 1000;
    expect(shadeRemainingMs(1000, 1000)).toBe(deadline);
    expect(shadeRemainingMs(1000, 1500)).toBe(deadline - 500);
    expect(shadeRemainingMs(1000, 1000 + deadline + 1)).toBe(0);
  });
});

describe("sceneIntro", () => {
  const base = { motion: true, mode: "full", ignite: true, phase: "wait" } as const;

  test("while the shade stands the scene gets the full intro", () => {
    expect(sceneIntro(base)).toBe("full");
    expect(sceneIntro({ ...base, phase: "lit" })).toBe("full");
  });

  test("after a lifted shade a full entrance is the short intro: the picture never dims twice", () => {
    expect(sceneIntro({ ...base, phase: "lifted" })).toBe("short");
    expect(sceneIntro({ ...base, phase: "off" })).toBe("short");
  });

  test("without the light-up the intro is the reveal mode, as before", () => {
    expect(sceneIntro({ ...base, ignite: false, phase: "off" })).toBe("full");
    expect(sceneIntro({ ...base, ignite: false, mode: "short", phase: "off" })).toBe("short");
    expect(sceneIntro({ ...base, ignite: true, mode: "short", phase: "off" })).toBe("short");
  });

  test("no motion or no entrance means no intro", () => {
    expect(sceneIntro({ ...base, motion: false })).toBe("none");
    expect(sceneIntro({ ...base, mode: "none" })).toBe("none");
    expect(sceneIntro({ ...base, ignite: false, motion: false, phase: "off" })).toBe("none");
  });
});
