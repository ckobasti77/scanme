import { describe, expect, test } from "vitest";
import { xrayKind } from "./xray";

describe("pravilo slotova u rendgenu", () => {
  test("karoserija: staklo i sočivo su rendgen staklo, ostalo je ljuska", () => {
    expect(xrayKind("karoserija", "mat_glass")).toBe("glass");
    expect(xrayKind("karoserija", "mat_lens")).toBe("glass");
    expect(xrayKind("karoserija", "mat_body_paint")).toBe("shell");
    expect(xrayKind("karoserija", "mat_trim_black")).toBe("shell");
  });

  test("svetla zadržavaju LED i sočivo, kućište dobija boju sistema", () => {
    expect(xrayKind("elektrika", "mat_led")).toBe("keep");
    expect(xrayKind("elektrika", "mat_led_red")).toBe("keep");
    expect(xrayKind("elektrika", "mat_lens")).toBe("keep");
    expect(xrayKind("elektrika", "mat_plastic")).toBe("system");
  });

  test("gume ostaju tamna guma, a felne, diskovi i guma drugih sistema dobijaju boju sistema", () => {
    expect(xrayKind("kocnice", "mat_rubber")).toBe("keep");
    expect(xrayKind("kocnice", "mat_wheel")).toBe("system");
    expect(xrayKind("kocnice", "mat_brake_disc")).toBe("system");
    expect(xrayKind("vesanje", "mat_rubber")).toBe("system");
    expect(xrayKind("hladjenje", "mat_rubber")).toBe("system");
  });
});
