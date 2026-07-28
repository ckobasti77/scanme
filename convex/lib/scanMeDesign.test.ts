import { expect, test } from "vitest";
import {
  PRESET_DESIGNS,
  normalizeScanMeDesign,
} from "../../lib/scanme-design";

test("Nature preset nosi eksplicitni ugrađeni asset kroz normalizaciju", () => {
  expect(PRESET_DESIGNS.nature.background).toMatchObject({
    kind: "image",
    builtInAsset: "nature",
  });

  const customized = structuredClone(PRESET_DESIGNS.nature);
  customized.presetKey = "custom";

  expect(normalizeScanMeDesign(customized).design.background).toMatchObject({
    kind: "image",
    builtInAsset: "nature",
  });
});

test("ručno izabrana image pozadina ne dobija Nature asset", () => {
  const manualImage = structuredClone(PRESET_DESIGNS.gentle);
  manualImage.presetKey = "custom";
  manualImage.background = {
    kind: "image",
    fit: "cover",
    position: "center",
    overlayColor: "#FFFFFF",
    overlayOpacity: 0.25,
  };

  const normalized = normalizeScanMeDesign(manualImage).design.background;
  expect(normalized.kind).toBe("image");
  if (normalized.kind !== "image") {
    throw new Error("Očekivana je image pozadina.");
  }
  expect(normalized.builtInAsset).toBeUndefined();
});
