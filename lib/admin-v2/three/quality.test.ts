import { describe, expect, test } from "vitest";
import {
  QUALITY_PHONE_WIDTH,
  STAGE_CONTEXT_LIMIT,
  STAGE_DPR_LIMIT,
  isSoftwareRenderer,
  pickQuality,
  qualityParams,
  stageDpr,
  type QualityEnv,
} from "./quality";

/** A healthy desktop: every test changes one thing. */
const healthy: QualityEnv = {
  webgl: true,
  softwareRenderer: false,
  cores: 8,
  memoryGb: 8,
  saveData: false,
  viewportWidth: 1440,
  contextLosses: 0,
  userChoice: null,
  downgraded: false,
};
const env = (patch: Partial<QualityEnv>): QualityEnv => ({ ...healthy, ...patch });

describe("pickQuality: off", () => {
  test("a healthy desktop is high", () => {
    expect(pickQuality(healthy)).toBe("high");
  });

  test("no WebGL is off", () => {
    expect(pickQuality(env({ webgl: false }))).toBe("off");
  });

  test("two cores or fewer is off, three is not", () => {
    expect(pickQuality(env({ cores: 2 }))).toBe("off");
    expect(pickQuality(env({ cores: 1 }))).toBe("off");
    expect(pickQuality(env({ cores: 3 }))).toBe("low");
  });

  test("save-data is off", () => {
    expect(pickQuality(env({ saveData: true }))).toBe("off");
  });

  test("two lost contexts are off, one is not", () => {
    expect(pickQuality(env({ contextLosses: 2 }))).toBe("off");
    expect(pickQuality(env({ contextLosses: 3 }))).toBe("off");
    expect(pickQuality(env({ contextLosses: 1 }))).toBe("high");
  });

  test("the user choosing 2D is off", () => {
    expect(pickQuality(env({ userChoice: "2d" }))).toBe("off");
  });
});

describe("pickQuality: low", () => {
  test("a phone-wide viewport is low, the limit itself is not", () => {
    expect(pickQuality(env({ viewportWidth: QUALITY_PHONE_WIDTH - 1 }))).toBe("low");
    expect(pickQuality(env({ viewportWidth: QUALITY_PHONE_WIDTH }))).toBe("high");
  });

  test("four cores or fewer is low, five is not", () => {
    expect(pickQuality(env({ cores: 4 }))).toBe("low");
    expect(pickQuality(env({ cores: 5 }))).toBe("high");
  });

  test("4 GB of memory or less is low, 8 is not", () => {
    expect(pickQuality(env({ memoryGb: 4 }))).toBe("low");
    expect(pickQuality(env({ memoryGb: 0.5 }))).toBe("low");
    expect(pickQuality(env({ memoryGb: 8 }))).toBe("high");
  });

  test("a software renderer is low, not off", () => {
    expect(pickQuality(env({ softwareRenderer: true }))).toBe("low");
  });

  test("a downgrade earlier in the session keeps it low", () => {
    expect(pickQuality(env({ downgraded: true }))).toBe("low");
  });
});

describe("pickQuality: unknowns and order", () => {
  test("unknown cores and unknown memory do not lower the quality", () => {
    expect(pickQuality(env({ cores: null }))).toBe("high");
    expect(pickQuality(env({ memoryGb: null }))).toBe("high");
    expect(pickQuality(env({ cores: null, memoryGb: null }))).toBe("high");
  });

  test("off wins over low", () => {
    expect(pickQuality(env({ webgl: false, softwareRenderer: true, viewportWidth: 400, downgraded: true }))).toBe("off");
    expect(pickQuality(env({ saveData: true, memoryGb: 2, cores: 4 }))).toBe("off");
    expect(pickQuality(env({ userChoice: "2d", downgraded: true }))).toBe("off");
  });
});

describe("isSoftwareRenderer", () => {
  test("knows the software renderers", () => {
    expect(isSoftwareRenderer("ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)")).toBe(true);
    expect(isSoftwareRenderer("llvmpipe (LLVM 15.0.7, 256 bits)")).toBe(true);
    expect(isSoftwareRenderer("Gallium 0.4 on softpipe")).toBe(true);
    expect(isSoftwareRenderer("Microsoft Basic Render Driver")).toBe(true);
    expect(isSoftwareRenderer("Mesa Software Rasterizer")).toBe(true);
  });

  test("real GPU names are not software", () => {
    expect(isSoftwareRenderer("ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)")).toBe(false);
    expect(isSoftwareRenderer("ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)")).toBe(false);
    expect(isSoftwareRenderer("Apple M2")).toBe(false);
    expect(isSoftwareRenderer("AMD Radeon Pro 5500M OpenGL Engine")).toBe(false);
  });

  test("null, undefined and an empty name are not software", () => {
    expect(isSoftwareRenderer(null)).toBe(false);
    expect(isSoftwareRenderer(undefined)).toBe(false);
    expect(isSoftwareRenderer("")).toBe(false);
  });
});

describe("qualityParams", () => {
  test("low", () => {
    expect(qualityParams("low")).toEqual({ dprMax: 1.25, bloom: false, particles: 150, msaa: 0 });
  });

  test("high", () => {
    expect(qualityParams("high")).toEqual({ dprMax: 1.5, bloom: true, particles: 600, msaa: 2 });
  });

  test("a caller cannot change the table by mutating the result", () => {
    const params = qualityParams("high");
    params.particles = 1;
    expect(qualityParams("high").particles).toBe(600);
  });
});

describe("stageDpr", () => {
  test("a plain screen stays at 1", () => {
    expect(stageDpr(1, "high")).toBe(1);
    expect(stageDpr(1, "low")).toBe(1);
  });

  test("a dense screen is capped by the quality", () => {
    expect(stageDpr(3, "high")).toBe(1.5);
    expect(stageDpr(3, "low")).toBe(1.25);
    expect(stageDpr(1.1, "high")).toBe(1.1);
  });

  test("never below 1", () => {
    expect(stageDpr(0.5, "high")).toBe(1);
    expect(stageDpr(0, "low")).toBe(1);
    expect(stageDpr(-2, "high")).toBe(1);
  });

  test("NaN gives 1, infinity gives the cap", () => {
    expect(stageDpr(Number.NaN, "high")).toBe(1);
    expect(stageDpr(Number.POSITIVE_INFINITY, "high")).toBe(1.5);
  });

  test("never above the hard limit", () => {
    for (const dpr of [1, 1.5, 2, 3, 4, 10]) {
      for (const quality of ["low", "high"] as const) {
        expect(stageDpr(dpr, quality)).toBeLessThanOrEqual(STAGE_DPR_LIMIT);
      }
    }
  });
});

describe("limits", () => {
  test("two contexts and a DPR of 2 at most", () => {
    expect(STAGE_CONTEXT_LIMIT).toBe(2);
    expect(STAGE_DPR_LIMIT).toBe(2);
  });
});
