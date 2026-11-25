// Sajam 2026 card 09 — the brand page's two counted families, asserted as the
// card's rule states them: modelsOnStand 1 -> "1 model", 2-4 -> "{n} modela",
// 5+ -> "{n} modela" (11-14 as 5+); selectedCount 1 -> "1 izabran", 2-4 ->
// "{n} izabrana", 5+ -> "{n} izabrano" (11-14 as 5+), 21 back to one. The
// rule is srPluralCategory (lib/i18n/format.ts), so the 21/22 pair is the
// load-bearing case: a naive n%10-only picker passes 1-14 and breaks there.
// Direct `fairBrandSr` import exactly like the page components do (file
// header), the same fixture-only style as i18n.test.ts — nothing renders.

import { describe, expect, test } from "vitest";
import { fairBrandSr } from "./fair-brand";

describe("modelsOnStand (card 09: model / modela / modela)", () => {
  test("declines the model noun across all three categories", () => {
    expect(fairBrandSr.modelsOnStand(1)).toBe("1 model");
    expect(fairBrandSr.modelsOnStand(2)).toBe("2 modela");
    expect(fairBrandSr.modelsOnStand(4)).toBe("4 modela");
    expect(fairBrandSr.modelsOnStand(5)).toBe("5 modela");
    // 11-14 count as many, not as the few their last digit suggests.
    expect(fairBrandSr.modelsOnStand(11)).toBe("11 modela");
    // 21 returns to one; 22 re-enters few — the mod-100 rule made visible.
    expect(fairBrandSr.modelsOnStand(21)).toBe("21 model");
    expect(fairBrandSr.modelsOnStand(22)).toBe("22 modela");
  });
});

describe("selectedCount (card 09: izabran / izabrana / izabrano)", () => {
  test("declines the masculine adjective, never the model noun's forms", () => {
    // "3 modela" and "3 izabrana" look alike only by accident: izabran is the
    // adjective agreeing with model, so its few form ends -a, not -a-of-modela.
    expect(fairBrandSr.selectedCount(1)).toBe("1 izabran");
    expect(fairBrandSr.selectedCount(2)).toBe("2 izabrana");
    expect(fairBrandSr.selectedCount(4)).toBe("4 izabrana");
    expect(fairBrandSr.selectedCount(5)).toBe("5 izabrano");
    expect(fairBrandSr.selectedCount(11)).toBe("11 izabrano");
    expect(fairBrandSr.selectedCount(21)).toBe("21 izabran");
    expect(fairBrandSr.selectedCount(22)).toBe("22 izabrana");
  });
});
