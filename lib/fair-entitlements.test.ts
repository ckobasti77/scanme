// Sajam 2026 B0 — the central entitlement contract (BACKEND-HANDOFF §4.1, §10,
// §12 "Entitlements i aktivacije"; MASTER §4, §7, §9, §11).

import { describe, expect, test } from "vitest";
import {
  FAIR_PACKAGE_TIERS,
  type FairEntitlements,
  type FairPackageTier,
} from "./fair-contract";
import {
  FAIR_ENTITLEMENT_CATALOG,
  canUpgradeFairPackage,
  deriveFairCapabilities,
  fairAnalyticsScope,
  fairAudienceQuestionLimit,
  fairAudienceQuestionsRemaining,
  fairBrandPassportEligible,
  fairFeatureActiveAt,
  fairFeatureSince,
  fairPackageChangeProblem,
  fairRatingInputProblem,
  fairScanCountsInAnalytics,
  fairTierAt,
  getFairEntitlements,
  type FairPackageHistory,
} from "./fair-entitlements";

// HANDOFF §4.1 transcribed independently of the implementation: one row per
// right, columns included / starter / advanced.
const HANDOFF_TABLE: Array<[keyof FairEntitlements, [unknown, unknown, unknown]]> = [
  ["publicModelPage", [true, true, true]],
  ["garage", [true, true, true]],
  ["standScanTotals", [true, true, true]],
  ["modelAnalytics", [false, true, true]],
  // "ukupna ocena 1–5" + "odvojene ocene izgleda/specifikacija/cene"
  ["ratingMode", ["none", "overall", "dimensions"]],
  ["interest", [false, true, true]],
  ["audienceQuestionsPerDay", [0, 1, 5]],
  ["dailyReport", [false, true, true]],
  ["testDrive", [false, false, true]],
  ["survey", [false, false, true]],
  ["postEventFollowUp", [false, false, true]],
  ["sponsoredMapRotation", [false, false, true]],
  ["sponsoredGarageRotation", [false, false, true]],
  // MASTER §11: a passport needs every model at Starter or higher.
  ["passportEligibleTier", [false, true, true]],
];

const T0 = Date.UTC(2026, 9, 9, 7, 0, 0); // 9 Oct 2026, 09:00 Belgrade
const HOUR = 60 * 60 * 1000;

describe("catalog (HANDOFF §4.1)", () => {
  test("every right of every tier matches the handoff table", () => {
    for (const [right, values] of HANDOFF_TABLE) {
      FAIR_PACKAGE_TIERS.forEach((tier, index) => {
        expect({ tier, right, value: getFairEntitlements(tier)[right] }).toEqual({
          tier,
          right,
          value: values[index],
        });
      });
    }
  });

  test("the catalog has exactly the handoff rights, nothing extra", () => {
    const expectedKeys = HANDOFF_TABLE.map(([right]) => right).sort();
    for (const tier of FAIR_PACKAGE_TIERS) {
      expect(Object.keys(FAIR_ENTITLEMENT_CATALOG[tier]).sort()).toEqual(expectedKeys);
    }
  });

  test("Advanced replaces the overall rating instead of adding a fourth one", () => {
    expect(getFairEntitlements("starter").ratingMode).toBe("overall");
    expect(getFairEntitlements("advanced").ratingMode).toBe("dimensions");
    expect(getFairEntitlements("included").ratingMode).toBe("none");
  });

  test("Advanced keeps every Starter business right except the rating shape", () => {
    const starter = getFairEntitlements("starter");
    const advanced = getFairEntitlements("advanced");
    for (const [right] of HANDOFF_TABLE) {
      if (right === "ratingMode" || right === "audienceQuestionsPerDay") continue;
      if (starter[right] === true) expect({ right, value: advanced[right] }).toEqual({ right, value: true });
    }
    expect(advanced.audienceQuestionsPerDay).toBeGreaterThan(starter.audienceQuestionsPerDay);
  });
});

describe("package changes: upgrade only (MASTER §4.4)", () => {
  const cases: Array<[FairPackageTier, FairPackageTier, ReturnType<typeof fairPackageChangeProblem>]> = [
    ["included", "starter", null],
    ["starter", "advanced", null],
    ["included", "advanced", null],
    ["starter", "included", "downgrade"],
    ["advanced", "starter", "downgrade"],
    ["advanced", "included", "downgrade"],
    ["included", "included", "same_tier"],
    ["starter", "starter", "same_tier"],
    ["advanced", "advanced", "same_tier"],
  ];
  test.each(cases)("%s → %s", (from, to, problem) => {
    expect(fairPackageChangeProblem(from, to)).toBe(problem);
    expect(canUpgradeFairPackage(from, to)).toBe(problem === null);
  });
});

describe("activation history and non-retroactivity", () => {
  const history: FairPackageHistory = {
    initialTier: "included",
    startedAt: T0,
    activations: [
      // Deliberately out of order: the helper must not depend on input order.
      { toTier: "advanced", activatedAt: T0 + 5 * HOUR },
      { toTier: "starter", activatedAt: T0 + 2 * HOUR },
    ],
  };

  test("the tier in force changes exactly at each activation instant", () => {
    expect(fairTierAt(history, T0)).toBe("included");
    expect(fairTierAt(history, T0 + 2 * HOUR - 1)).toBe("included");
    expect(fairTierAt(history, T0 + 2 * HOUR)).toBe("starter");
    expect(fairTierAt(history, T0 + 5 * HOUR - 1)).toBe("starter");
    expect(fairTierAt(history, T0 + 5 * HOUR)).toBe("advanced");
  });

  test("an upgrade is effective immediately", () => {
    expect(fairFeatureActiveAt(history, "interest", T0 + 2 * HOUR)).toBe(true);
    expect(fairFeatureActiveAt(history, "testDrive", T0 + 5 * HOUR)).toBe(true);
  });

  test("paid interactions are never attributed to the time before activation", () => {
    expect(fairFeatureActiveAt(history, "interest", T0 + HOUR)).toBe(false);
    expect(fairFeatureActiveAt(history, "rating", T0 + HOUR)).toBe(false);
    expect(fairFeatureActiveAt(history, "testDrive", T0 + 3 * HOUR)).toBe(false);
    expect(fairFeatureActiveAt(history, "survey", T0 + 3 * HOUR)).toBe(false);
    expect(fairFeatureSince(history, "interest")).toBe(T0 + 2 * HOUR);
    expect(fairFeatureSince(history, "testDrive")).toBe(T0 + 5 * HOUR);
  });

  test("a feature the model never had has no attribution window", () => {
    const starterOnly: FairPackageHistory = { initialTier: "starter", startedAt: T0, activations: [] };
    expect(fairFeatureSince(starterOnly, "testDrive")).toBeNull();
    expect(fairFeatureSince(starterOnly, "interest")).toBe(T0);
  });

  test("scans before an upgrade stay in analytics", () => {
    expect(fairScanCountsInAnalytics()).toBe(true);
    expect(fairAnalyticsScope(fairTierAt(history, T0 + HOUR))).toBe("stand_totals");
    expect(fairAnalyticsScope(fairTierAt(history, T0 + 6 * HOUR))).toBe("model");
  });
});

describe("Glas publike: 0 / 1 / 5 questions per fair day", () => {
  test("per-tier daily limit", () => {
    expect(fairAudienceQuestionLimit("included")).toBe(0);
    expect(fairAudienceQuestionLimit("starter")).toBe(1);
    expect(fairAudienceQuestionLimit("advanced")).toBe(5);
  });

  test("Starter publishes one and is then full", () => {
    expect(fairAudienceQuestionsRemaining("starter", 0)).toBe(1);
    expect(fairAudienceQuestionsRemaining("starter", 1)).toBe(0);
    expect(fairAudienceQuestionsRemaining("included", 0)).toBe(0);
  });

  test("upgrade mid-day: the used Starter question counts toward the five", () => {
    expect(fairAudienceQuestionsRemaining("advanced", 1)).toBe(4);
    expect(fairAudienceQuestionsRemaining("advanced", 5)).toBe(0);
    expect(fairAudienceQuestionsRemaining("advanced", 7)).toBe(0);
  });
});

describe("ratings: Starter overall, Advanced three optional dimensions", () => {
  test("included has no rating", () => {
    expect(fairRatingInputProblem("included", { overall: 4 })).toBe("FEATURE_NOT_ENTITLED");
  });

  test("Starter accepts exactly overall", () => {
    expect(fairRatingInputProblem("starter", { overall: 1 })).toBeNull();
    expect(fairRatingInputProblem("starter", { overall: 5 })).toBeNull();
    expect(fairRatingInputProblem("starter", {})).toBe("INVALID_INPUT");
    expect(fairRatingInputProblem("starter", { appearance: 4 })).toBe("INVALID_INPUT");
    expect(fairRatingInputProblem("starter", { overall: 4, price: 3 })).toBe("INVALID_INPUT");
  });

  test("Advanced never accepts overall and needs at least one dimension", () => {
    expect(fairRatingInputProblem("advanced", { overall: 4 })).toBe("INVALID_INPUT");
    expect(fairRatingInputProblem("advanced", { overall: 4, appearance: 5 })).toBe("INVALID_INPUT");
    expect(fairRatingInputProblem("advanced", {})).toBe("INVALID_INPUT");
    expect(fairRatingInputProblem("advanced", { appearance: 5 })).toBeNull();
    expect(fairRatingInputProblem("advanced", { specifications: 3, price: 2 })).toBeNull();
    expect(fairRatingInputProblem("advanced", { appearance: 1, specifications: 2, price: 3 })).toBeNull();
  });

  test("values are integers from 1 to 5", () => {
    for (const bad of [0, 6, 3.5, -1, Number.NaN]) {
      expect(fairRatingInputProblem("starter", { overall: bad })).toBe("INVALID_INPUT");
      expect(fairRatingInputProblem("advanced", { price: bad })).toBe("INVALID_INPUT");
    }
  });
});

describe("analytics scope and brand passport", () => {
  test("included sees only stand totals; Starter+ sees per-model analytics", () => {
    expect(fairAnalyticsScope("included")).toBe("stand_totals");
    expect(fairAnalyticsScope("starter")).toBe("model");
    expect(fairAnalyticsScope("advanced")).toBe("model");
  });

  test("passport needs ≥2 exhibited models, all Starter or Advanced", () => {
    expect(fairBrandPassportEligible([])).toBe(false);
    expect(fairBrandPassportEligible([{ packageTier: "advanced" }])).toBe(false);
    expect(fairBrandPassportEligible([{ packageTier: "starter" }, { packageTier: "included" }])).toBe(false);
    expect(fairBrandPassportEligible([{ packageTier: "starter" }, { packageTier: "advanced" }])).toBe(true);
    expect(
      fairBrandPassportEligible([{ packageTier: "starter" }, { packageTier: "starter" }, { packageTier: "starter" }]),
    ).toBe(true);
  });
});

describe("server-projected capabilities", () => {
  const everything = {
    hasOpenAudienceQuestions: true,
    hasPublishedSurvey: true,
    inPublishedSponsoredSnapshot: true,
    interestLeadEnabled: true,
    testDriveLeadEnabled: true,
  };
  const nothing = {
    hasOpenAudienceQuestions: false,
    hasPublishedSurvey: false,
    inPublishedSponsoredSnapshot: false,
    interestLeadEnabled: false,
    testDriveLeadEnabled: false,
  };

  test("included unlocks nothing even when content exists", () => {
    expect(deriveFairCapabilities("included", everything)).toEqual({
      ratingMode: "none",
      canSubmitInterest: false,
      canRequestTestDrive: false,
      hasAudienceQuestions: false,
      hasSurvey: false,
      isSponsored: false,
    });
  });

  test("Starter: overall rating, interest and questions; never test drive, survey or sponsorship", () => {
    expect(deriveFairCapabilities("starter", everything)).toEqual({
      ratingMode: "overall",
      canSubmitInterest: true,
      canRequestTestDrive: false,
      hasAudienceQuestions: true,
      hasSurvey: false,
      isSponsored: false,
    });
  });

  test("Advanced: all features, but only where content/config actually exists", () => {
    expect(deriveFairCapabilities("advanced", everything)).toEqual({
      ratingMode: "dimensions",
      canSubmitInterest: true,
      canRequestTestDrive: true,
      hasAudienceQuestions: true,
      hasSurvey: true,
      isSponsored: true,
    });
    expect(deriveFairCapabilities("advanced", nothing)).toEqual({
      ratingMode: "dimensions",
      canSubmitInterest: false,
      canRequestTestDrive: false,
      hasAudienceQuestions: false,
      hasSurvey: false,
      isSponsored: false,
    });
  });
});
