import { describe, expect, test } from "vitest";
import { activeSubpageProfile } from "./subpage-keys";

const services = [
  { id: "links-inactive", type: "scanme_links", active: false },
  { id: "links-active", type: "scanme_links", active: true },
  { id: "review-active", type: "google_review", active: true },
];

describe("activeSubpageProfile", () => {
  test("maps each legacy subpage to its active server profile", () => {
    expect(activeSubpageProfile("links", services)?.id).toBe("links-active");
    expect(activeSubpageProfile("review", services)?.id).toBe("review-active");
    expect(activeSubpageProfile("menu", services)).toBeUndefined();
  });

  test("does not fall back to an inactive or unrelated profile", () => {
    expect(activeSubpageProfile("venue", services)).toBeUndefined();
    expect(activeSubpageProfile("links", services)?.id).not.toBe("links-inactive");
  });
});
