import { describe, expect, test } from "vitest";
import { fmt, getDict } from "./index";
import type { VenueEditorDict } from "./types";

describe("fmt (RFC-001 §2.12)", () => {
  test("interpolates named placeholders", () => {
    expect(
      fmt("Uređivanje {product} stranice.", { product: "ScanMe Venue" }),
    ).toBe("Uređivanje ScanMe Venue stranice.");
  });

  test("stringifies number params", () => {
    expect(fmt("{n} slika", { n: 3 })).toBe("3 slika");
  });

  test("leaves an unmatched placeholder verbatim so a missing param is visible", () => {
    expect(fmt("{a} i {b}", { a: "x" })).toBe("x i {b}");
  });
});

describe("getDict", () => {
  test("returns the venue-editor dictionary with its typed key", () => {
    const dict = getDict("venue-editor");
    expect(dict.editorAccessDisabled).toBe(
      "Uređivanje {product} stranice nije omogućeno za klijenta.",
    );
  });

  test("the consent surface is filled and versioned (TASK-17)", () => {
    // Empty-but-typed until the upload screen existed; TASK-17 built the
    // screen and wrote the notice with it. The version constant lives beside
    // the copy and is what reserveUpload stamps onto memoriesGuests.
    const consent = getDict("consent");
    expect(consent.inlineAct.length).toBeGreaterThan(0);
    expect(consent.inlineRetention).toContain("{days}");
  });

  test("the venue surface is filled (TASK-09)", () => {
    expect(getDict("venue").liveBadge).toBe("Uživo");
  });

  test("the memories and resolver surfaces are filled (TASK-14)", () => {
    expect(getDict("memories").quotaReached).toBe(
      "Dostigli ste limit od {limit} fotografija.",
    );
    expect(getDict("resolver").title.length).toBeGreaterThan(0);
  });
});

// Type-level proof that the `as const satisfies XDict` pattern makes a MISSING
// key a compile error, so `npm run check` (tsc via `next build`) catches an
// incomplete dictionary. The @ts-expect-error is REQUIRED to compile: an empty
// object does not satisfy VenueEditorDict (it lacks `editorAccessDisabled`). If
// `satisfies` ever stopped catching missing keys, this directive would become
// unused and tsc would fail with TS2578 — turning a silent regression into a
// build break.
describe("dictionary completeness is enforced at compile time", () => {
  test("an incomplete dictionary fails `satisfies` (type-level)", () => {
    // @ts-expect-error missing every VenueEditorDict key
    const incomplete = {} as const satisfies VenueEditorDict;
    // The real dictionary is the complete example — it type-checks via the
    // same `satisfies` in its module.
    const complete: VenueEditorDict = getDict("venue-editor");
    expect(incomplete).toEqual({});
    expect(complete.editorAccessDisabled).toBe(
      "Uređivanje {product} stranice nije omogućeno za klijenta.",
    );
  });
});
