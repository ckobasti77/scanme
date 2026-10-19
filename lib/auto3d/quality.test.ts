import { describe, expect, test } from "vitest";
import { MAX_PIXELS, chooseQuality, dprFor, isSoftwareRenderer, type QualityInput } from "./quality";

const desk: QualityInput = { width: 1440, webgl2: true, software: false, cores: 8, memory: 8, finePointer: true, kiosk: false, dpr: 1 };
const phone: QualityInput = { width: 390, webgl2: true, software: false, cores: 8, memory: 4, finePointer: false, kiosk: false, dpr: 3 };

describe("izbor kvaliteta", () => {
  test("bez WebGL2 nema 3D-a", () => {
    expect(chooseQuality({ ...desk, webgl2: false }).glb).toBeNull();
  });

  test("softverski renderer: lite i DPR 1 (E5)", () => {
    expect(chooseQuality({ ...desk, software: true })).toMatchObject({ glb: "lite", maxDpr: 1, msaa: false });
    expect(isSoftwareRenderer("ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)")).toBe(true);
    expect(isSoftwareRenderer("ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Laptop GPU)")).toBe(false);
  });

  test("kiosk: desktop GLB, DPR 1,5, bez hover-a", () => {
    expect(chooseQuality({ ...desk, kiosk: true })).toMatchObject({ glb: "desktop", maxDpr: 1.5, hover: false });
  });

  test("telefon i mala memorija: lite", () => {
    expect(chooseQuality(phone)).toMatchObject({ glb: "lite", maxDpr: 1.5, hover: false });
    expect(chooseQuality({ ...desk, memory: 2 }).glb).toBe("lite");
  });

  test("desktop: desktop GLB, DPR 2, MSAA samo ispod DPR 1,5", () => {
    expect(chooseQuality(desk)).toMatchObject({ glb: "desktop", maxDpr: 2, msaa: true, hover: true });
    expect(chooseQuality({ ...desk, dpr: 2 }).msaa).toBe(false);
  });

  test("ostalo (uzak prozor sa mišem, slab procesor): lite", () => {
    expect(chooseQuality({ ...desk, width: 900 }).glb).toBe("lite");
    expect(chooseQuality({ ...desk, cores: 2 }).glb).toBe("lite");
  });

  test("Save-Data: bez automatskog učitavanja (E16)", () => {
    expect(chooseQuality({ ...phone, saveData: true }).autoload).toBe(false);
    expect(chooseQuality(phone).autoload).toBe(true);
    // Kiosk na štandu nema ko da pritisne dugme (A13).
    expect(chooseQuality({ ...desk, kiosk: true, saveData: true }).autoload).toBe(true);
  });

  test("dprFor: uređaj, plan, budžet piksela i najmanje 1", () => {
    expect(dprFor(390, 473, 3, 1.5)).toBe(1.5);
    expect(dprFor(1376, 748, 1, 2)).toBe(1);
    expect(dprFor(2560, 1440, 2, 2)).toBeCloseTo(Math.sqrt(MAX_PIXELS / (2560 * 1440)));
    expect(dprFor(7680, 4320, 2, 2)).toBe(1);
  });
});
