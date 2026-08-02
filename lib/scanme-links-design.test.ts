import { describe, expect, it } from "vitest";
import {
  createDefaultScanMeLinksDesignV2,
  normalizeDesignForPreset,
  type ScanMeLinksDesignV2Input,
} from "./scanme-links-design";

describe("ScanMe Links design normalization", () => {
  it("adds disabled text and logo shadows to legacy version 2 designs", () => {
    const current = createDefaultScanMeLinksDesignV2("gentle");
    const legacy: ScanMeLinksDesignV2Input = { ...current };
    delete legacy.effects;
    const normalized = normalizeDesignForPreset(legacy);

    expect(normalized.effects.textShadow.enabled).toBe(false);
    expect(normalized.effects.logoShadow.enabled).toBe(false);
    expect(normalized.buttons.shadow.enabled).toBe(true);
  });
});
