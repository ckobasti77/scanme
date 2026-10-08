// Sajam 2026 N6 (F3) — the adapter from the server projection
// (fairPublic.getModelBySlug) to the model page props. TEST data only.

import { describe, expect, test } from "vitest";
import type { FairLeadFormView, FairPublicModel } from "@/lib/fair-contract";
import { readFairModelFixture } from "@/lib/fair-client/model-fixtures";
import {
  FAIR_REAL_MODEL_INTERACTIONS,
  fairModelHighlights,
  fairModelPageFromFixture,
  fairModelPageFromPublic,
  fairOpenLeadForm,
  fairSpecificationIcon,
} from "./model-view";

const item = (id: string, label: string, order: number, isHighlight: boolean) => ({ id, label, value: `TEST vrednost ${order}`, order, isHighlight });

const MODEL: FairPublicModel = {
  id: "test-model-id",
  eventId: "test-event-id",
  eventSlug: "test-elektromobilnost-2026",
  eventTitle: "TEST Sajam elektromobilnosti",
  participationId: "test-participation",
  exhibitorName: "TEST Izlagač A",
  brandId: "test-brand",
  brandName: "TEST Volta",
  standId: "test-stand",
  standMapLocationId: "hala-12",
  slug: "test-volta-x1-test-premium",
  displayName: "TEST Volta X1",
  variant: "TEST Premium",
  priceText: "TEST cena",
  specificationGroups: [
    { id: "test-ostalo", label: "TEST ostalo", order: 2, items: [item("s5", "TEST pogon", 5, false), item("s4", "TEST punjenje", 4, true)] },
    { id: "test-performanse", label: "TEST performanse", order: 1, items: [item("s2", "TEST domet", 2, true), item("s1", "TEST snaga", 1, true), item("s3", "TEST baterija", 3, true)] },
    { id: "test-prazno", label: "TEST prazno", order: 3, items: [] },
  ],
  capabilities: { ratingMode: "dimensions", canSubmitInterest: true, canRequestTestDrive: true, hasAudienceQuestions: true, hasSurvey: true, isSponsored: true },
};

describe("fairModelPageFromPublic", () => {
  test("keeps server order, joins the variant, takes capabilities from the projection and invents nothing", () => {
    const view = fairModelPageFromPublic(MODEL, { umbrellaTitle: "Sajam automobila" });
    expect(view).toMatchObject({
      source: "convex",
      id: "test-model-id",
      eventId: "test-event-id",
      eventSlug: "test-elektromobilnost-2026",
      eventTitle: "Sajam automobila",
      eventName: "TEST Sajam elektromobilnosti",
      exhibitorName: "TEST Izlagač A",
      brandName: "TEST Volta",
      modelSlug: "test-volta-x1-test-premium",
      displayName: "TEST Volta X1 TEST Premium",
      priceText: "TEST cena",
      photoPresentation: "left",
      capabilities: MODEL.capabilities,
    });
    expect(view.specificationGroups.map((group) => [group.id, group.items.map((row) => row.id)])).toEqual([
      ["test-performanse", ["s1", "s2", "s3"]],
      ["test-ostalo", ["s4", "s5"]],
    ]);
    expect(view.highlights.map((row) => row.id)).toEqual(["s1", "s2", "s3", "s4"]);
    // No photo, no description: nothing is invented.
    expect(view.photoUrl).toBeUndefined();
    expect(view.description).toBeUndefined();
    expect(JSON.stringify(view)).not.toMatch(/\baudi\b|RS 3|showroom|fixture/i);
  });

  test("a photo is used as given; without a variant the name stays as is", () => {
    const view = fairModelPageFromPublic({ ...MODEL, variant: undefined, photoUrl: "https://example.invalid/test.jpg" }, { umbrellaTitle: "Sajam automobila" });
    expect(view.displayName).toBe("TEST Volta X1");
    expect(view.photoUrl).toBe("https://example.invalid/test.jpg");
    expect(fairModelPageFromPublic({ ...MODEL, photoUrl: "  " }, { umbrellaTitle: "x" }).photoUrl).toBeUndefined();
  });

  test("highlights: flagged ones (at most 4); with none flagged the first real specifications; none at all → empty", () => {
    const groups = (flags: boolean[]) => [{ id: "g", label: "G", items: flags.map((flag, index) => ({ id: `i${index}`, label: `L${index}`, shortLabel: `L${index}`, value: `V${index}`, isHighlight: flag })) }];
    expect(fairModelHighlights(groups([false, true, false, true])).map((row) => row.id)).toEqual(["i1", "i3"]);
    expect(fairModelHighlights(groups([false, false, false, false, false])).map((row) => row.id)).toEqual(["i0", "i1", "i2", "i3"]);
    expect(fairModelHighlights(groups([true, true, true, true, true, true])).map((row) => row.id)).toEqual(["i0", "i1", "i2", "i3"]);
    expect(fairModelHighlights([])).toEqual([]);
  });

  test("icons follow what the label says (decoration only)", () => {
    expect(fairSpecificationIcon("Snaga")).toBe("power");
    expect(fairSpecificationIcon("Obrtni moment")).toBe("torque");
    expect(fairSpecificationIcon("Ubrzanje 0-100 km/h")).toBe("acceleration");
    expect(fairSpecificationIcon("Maksimalna brzina")).toBe("speed");
    expect(fairSpecificationIcon("Domet (WLTP)")).toBe("range");
    expect(fairSpecificationIcon("Kapacitet baterije")).toBe("battery");
    expect(fairSpecificationIcon("Brzina punjenja")).toBe("charging");
    expect(fairSpecificationIcon("Pogon")).toBeUndefined();
  });
});

describe("lead forms and interactions", () => {
  test("only an `open` form becomes a button", () => {
    const open: FairLeadFormView = { eventModelId: "m", kind: "interest", state: "open", contactRequirement: "one_of", consent: { version: 2, text: "TEST" } };
    expect(fairOpenLeadForm(open)).toBe(open);
    for (const state of ["leads_disabled", "unavailable", "consent_not_configured"] as const) {
      expect(fairOpenLeadForm({ eventModelId: "m", kind: "interest", state })).toBeNull();
    }
    expect(fairOpenLeadForm(null)).toBeNull();
    expect(fairOpenLeadForm(undefined)).toBeNull();
  });

  test("a real model shows no unwired interaction (rating, Glas publike)", () => {
    expect(FAIR_REAL_MODEL_INTERACTIONS).toEqual({ rating: false, audience: false });
  });

  test("the DEV fixture keeps its demo data and is marked as a fixture", () => {
    const fixture = readFairModelFixture({ eventSlug: "auto-moto-fest-2026", modelSlug: "audi-rs-3-sportback", mode: "starter", withPhoto: false, photoPresentation: "right" })!;
    const view = fairModelPageFromFixture(fixture);
    expect(view).toMatchObject({ source: "fixture", displayName: "RS 3 Sportback", photoPresentation: "right", capabilities: { ratingMode: "overall" } });
    expect(view.photoUrl).toBeUndefined();
    expect(view.highlights).toHaveLength(4);
  });
});
