import { describe, expect, test } from "vitest";
import {
  buildLeadFormRows,
  expectedLeadForm,
  leadFormDefaults,
  leadFormModelCounts,
  pendingLeadFormModels,
  sameLeadForm,
  selectedLeadFormExhibitor,
  type LeadFormsSource,
} from "./lead-forms";

// Admin UX A7 — `interakcije/forme` rows: the stored state per model and
// kind, where it comes from, whether it still waits for "Primeni na sve
// modele" and why a package lacks a form. TEST data only.

const source: LeadFormsSource = {
  defaults: [
    { participationId: "p-a", leadKind: "interest", enabled: true, contactRequirement: "one_of", updatedAt: 1 },
    { participationId: "p-a", leadKind: "test_drive", enabled: true, contactRequirement: "both", preferredContact: "phone", updatedAt: 1 },
  ],
  models: [
    {
      eventModelId: "adv", participationId: "p-a", packageTier: "advanced",
      interest: { entitled: true, config: { enabled: false, contactRequirement: "phone", source: "override", updatedAt: 1 } },
      testDrive: { entitled: true, config: { enabled: true, contactRequirement: "both", preferredContact: "phone", source: "default", updatedAt: 1 } },
    },
    {
      eventModelId: "st", participationId: "p-a", packageTier: "starter",
      interest: { entitled: true, config: { enabled: true, contactRequirement: "email", source: "default", updatedAt: 1 } },
      testDrive: { entitled: false, config: { enabled: false, contactRequirement: "both", preferredContact: "phone", source: "default", updatedAt: 1 } },
    },
    { eventModelId: "inc", participationId: "p-a", packageTier: "included", interest: { entitled: false, config: null }, testDrive: { entitled: false, config: null } },
    { eventModelId: "other", participationId: "p-b", packageTier: "starter", interest: { entitled: true, config: null }, testDrive: { entitled: false, config: null } },
  ],
};
const names = {
  models: new Map([
    ["adv", { name: "TEST Volta X2", brandName: "TEST Volta" }],
    ["st", { name: "TEST Volta X1", brandName: "TEST Volta" }],
    ["inc", { name: "TEST Amper A1", brandName: "TEST Amper" }],
    ["other", { name: "TEST Om Z1", brandName: "TEST Om" }],
  ]),
};

describe("A7 lead form rows", () => {
  test("the default per exhibitor and what it gives a model (off without the package)", () => {
    expect(leadFormDefaults(source, "p-a")).toEqual({
      interest: { enabled: true, contactRequirement: "one_of" },
      test_drive: { enabled: true, contactRequirement: "both", preferredContact: "phone" },
    });
    expect(leadFormDefaults(source, "p-b")).toEqual({ interest: null, test_drive: null });
    expect(expectedLeadForm({ enabled: true, contactRequirement: "both" }, false)).toEqual({ enabled: false, contactRequirement: "both" });
    expect(expectedLeadForm(null, true)).toBeNull();
    expect(sameLeadForm({ enabled: true, contactRequirement: "email" }, { enabled: true, contactRequirement: "email", preferredContact: undefined })).toBe(true);
    expect(sameLeadForm({ enabled: true, contactRequirement: "email" }, { enabled: true, contactRequirement: "email", preferredContact: "phone" })).toBe(false);
  });

  test("cells: state, source and pending; an exception never waits for the default; a model without the package says so", () => {
    const rows = buildLeadFormRows(source, names, "p-a");
    expect(rows.map((row) => row.modelId)).toEqual(["inc", "st", "adv"]); // brand, then name
    const byId = new Map(rows.map((row) => [row.modelId, row]));
    expect(byId.get("adv")!.interest).toMatchObject({ state: "off", pending: false, config: { source: "override" } });
    expect(byId.get("adv")!.testDrive).toMatchObject({ state: "on", pending: false, config: { source: "default", preferredContact: "phone" } });
    // Default-sourced but written from an older default (email ≠ one_of): waits for "Primeni".
    expect(byId.get("st")!.interest).toMatchObject({ state: "on", pending: true, expected: { enabled: true, contactRequirement: "one_of" } });
    expect(byId.get("st")!.testDrive).toMatchObject({ state: "not_entitled", pending: false, entitled: false });
    // The package lacks both forms: nothing to wait for (it stays off either way).
    expect(byId.get("inc")!.interest).toMatchObject({ state: "not_entitled", pending: false, expected: { enabled: false } });
    expect(pendingLeadFormModels(rows)).toBe(1);
    expect(buildLeadFormRows(source, names, "p-b")[0].interest).toMatchObject({ state: "not_set", pending: false, expected: null });
  });

  test("the page opens on ?izlagac=, else on the exhibitor of ?model=, else on the first one; models per exhibitor", () => {
    const exhibitors = [{ id: "p-a" }, { id: "p-b" }];
    expect(selectedLeadFormExhibitor(exhibitors, source, { izlagac: "p-b" })).toBe("p-b");
    expect(selectedLeadFormExhibitor(exhibitors, source, { model: "other" })).toBe("p-b");
    expect(selectedLeadFormExhibitor(exhibitors, source, { izlagac: "p-x", model: "nope" })).toBe("p-a");
    expect(selectedLeadFormExhibitor([], source, {})).toBeNull();
    expect(leadFormModelCounts(source)).toEqual(new Map([["p-a", 3], ["p-b", 1]]));
  });
});
