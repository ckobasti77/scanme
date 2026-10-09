import { describe, expect, test } from "vitest";
import { belgradeDateKey, getFairBannerStatus } from "./prelaunch-fair-banner";

describe("getFairBannerStatus", () => {
  test("pre prvog sajma: sledeći je prvi", () => {
    expect(getFairBannerStatus(new Date("2026-10-08T12:00:00Z"))).toEqual({ kind: "next", eventIndex: 0 });
  });

  test("tokom prvog sajma: u toku, uključujući poslednji dan", () => {
    expect(getFairBannerStatus(new Date("2026-10-09T08:00:00Z"))).toEqual({ kind: "live", eventIndex: 0 });
    expect(getFairBannerStatus(new Date("2026-10-11T21:30:00Z"))).toEqual({ kind: "live", eventIndex: 0 });
  });

  test("dan se računa po Beogradu, ne po UTC-u", () => {
    // 22:30 UTC 8. 10. je već 00:30 9. 10. u Beogradu (CEST, UTC+2).
    expect(belgradeDateKey(new Date("2026-10-08T22:30:00Z"))).toBe("2026-10-09");
    expect(getFairBannerStatus(new Date("2026-10-08T22:30:00Z"))).toEqual({ kind: "live", eventIndex: 0 });
    // 22:30 UTC 11. 10. je 00:30 12. 10. u Beogradu: prvi sajam je gotov.
    expect(getFairBannerStatus(new Date("2026-10-11T22:30:00Z"))).toEqual({ kind: "next", eventIndex: 1 });
  });

  test("između sajmova: sledeći je drugi", () => {
    expect(getFairBannerStatus(new Date("2026-10-20T12:00:00Z"))).toEqual({ kind: "next", eventIndex: 1 });
  });

  test("tokom drugog sajma i preko promene meseca", () => {
    expect(getFairBannerStatus(new Date("2026-10-30T09:00:00Z"))).toEqual({ kind: "live", eventIndex: 1 });
    expect(getFairBannerStatus(new Date("2026-11-01T20:00:00Z"))).toEqual({ kind: "live", eventIndex: 1 });
  });

  test("posle oba sajma: završeno", () => {
    expect(getFairBannerStatus(new Date("2026-11-02T10:00:00Z"))).toEqual({ kind: "ended" });
  });
});
