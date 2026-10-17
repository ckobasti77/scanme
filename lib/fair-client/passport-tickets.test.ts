import { describe, expect, it } from "vitest";
import type { FairPassportCatalogEntry, FairPassportProgress } from "@/lib/fair-contract";
import { passportEventMark, passportTicketView, passportTicketsSummary } from "./passport-tickets";

const entry: FairPassportCatalogEntry = {
  passportId: "p1",
  eventId: "e1",
  brandId: "b1",
  brandName: "AUDI_T",
  standMapLocationIds: [],
  models: ["m1", "m2", "m3"].map((id) => ({ eventModelId: id, slug: id, displayName: id })),
};

function progress(stampedModelIds: string[], completed = false): FairPassportProgress {
  return { passportId: "p1", stampedModelIds, stampedCount: stampedModelIds.length, requiredCount: 3, completed };
}

describe("passportTicketView", () => {
  it("starts empty without progress", () => {
    expect(passportTicketView(entry, undefined, [])).toEqual({ cells: ["missing", "missing", "missing"], got: 0, fresh: 0, total: 3, complete: false });
  });

  it("splits stamped models into stuck and new", () => {
    const view = passportTicketView(entry, progress(["m1", "m3"]), ["m3"]);
    expect(view.cells).toEqual(["got", "missing", "new"]);
    expect(view).toMatchObject({ got: 1, fresh: 1, complete: false });
  });

  it("is complete only when every stamp is stuck", () => {
    expect(passportTicketView(entry, progress(["m1", "m2", "m3"], true), ["m2"]).complete).toBe(false);
    expect(passportTicketView(entry, progress(["m1", "m2", "m3"], true), []).complete).toBe(true);
  });

  it("ignores unread ids that are not stamped", () => {
    expect(passportTicketView(entry, progress(["m1"]), ["m2"]).cells).toEqual(["got", "missing", "missing"]);
  });
});

describe("passportTicketsSummary", () => {
  it("adds up stamps, complete passports and new stamps", () => {
    const a = passportTicketView(entry, progress(["m1", "m2", "m3"], true), []);
    const b = passportTicketView(entry, progress(["m1", "m2"]), ["m2"]);
    expect(passportTicketsSummary([a, b])).toEqual({ got: 4, total: 6, complete: 1, fresh: 1 });
  });
});

describe("passportEventMark", () => {
  it("reads name, year and city from event data", () => {
    expect(passportEventMark("Auto Moto Fest 2026", "Hala Čair, Niš")).toEqual({ name: "Auto Moto Fest", year: "2026", city: "Niš" });
    expect(passportEventMark("TEST Auto Moto Fest 2026", "Hala Čair, Niš")).toMatchObject({ name: "Auto Moto Fest" });
  });

  it("falls back to the start date for the year and to no city", () => {
    expect(passportEventMark("TEST Auto Moto Fest", "Hala Čair", Date.UTC(2026, 9, 30, 8))).toEqual({ name: "Auto Moto Fest", year: "2026", city: "" });
  });
});
