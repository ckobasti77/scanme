import { describe, expect, it } from "vitest";
import { fairBrandKey, fairBrandVector } from "./fair-brand-logo";

describe("fairBrandKey", () => {
  it("drops the DEV test markers", () => {
    expect(fairBrandKey("AUDI_T")).toBe("audi");
    expect(fairBrandKey("AUDI T")).toBe("audi");
    expect(fairBrandKey("TEST Audi")).toBe("audi");
    expect(fairBrandKey("test toyota_T")).toBe("toyota");
  });

  it("trims, collapses spaces and ignores case", () => {
    expect(fairBrandKey("  Mercedes-Benz  ")).toBe("mercedes-benz");
    expect(fairBrandKey("Alfa   Romeo")).toBe("alfa romeo");
    expect(fairBrandKey("VOLKSWAGEN")).toBe("volkswagen");
  });

  it("removes diacritics", () => {
    expect(fairBrandKey("Citroën")).toBe("citroen");
    expect(fairBrandKey("ŠKODA")).toBe("skoda");
  });

  it("keeps names that only contain a T elsewhere", () => {
    expect(fairBrandKey("Tesla")).toBe("tesla");
    expect(fairBrandKey("Fiat")).toBe("fiat");
    expect(fairBrandKey("MG")).toBe("mg");
  });
});

describe("fairBrandVector", () => {
  it("finds the simple-icons mark for test data", () => {
    const audi = fairBrandVector("AUDI_T");
    expect(audi?.kind).toBe("path");
    expect(audi?.hex).toBe("#BB0A30");
  });

  it("uses the local file for brands simple-icons lacks", () => {
    expect(fairBrandVector("Mercedes-Benz")).toMatchObject({ kind: "file", src: "/fair/brands/mercedes-benz.svg" });
    expect(fairBrandVector("Mercedes")).toMatchObject({ kind: "file", src: "/fair/brands/mercedes-benz.svg" });
    expect(fairBrandVector("TEST Geely")).toMatchObject({ kind: "file", src: "/fair/brands/geely.svg" });
    expect(fairBrandVector("Dongfeng")).toMatchObject({ kind: "file" });
    expect(fairBrandVector("Ineos")).toMatchObject({ kind: "file", src: "/fair/brands/ineos.svg" });
    expect(fairBrandVector("Fiat")?.kind).toBe("path");
  });

  it("returns null for an unknown brand", () => {
    expect(fairBrandVector("SWM")).toBeNull();
    expect(fairBrandVector("Arvena")).toBeNull();
  });
});
