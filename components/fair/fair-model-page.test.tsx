// Sajam 2026 N6 (F3) — SSR markup of the public model page: a real model from
// the server projection (lead buttons only for `open` forms, no unwired
// interaction, no DEV controls), the state without any form, the lead form
// markup (fields by rule, 16 px-safe attributes, consent, no date), and the
// route itself with a mocked Convex read (notFound, DEV-only fixture).

import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { FairLeadFormView, FairPublicModel } from "@/lib/fair-contract";
import { fairModelSr } from "@/lib/i18n/sr/fair-model";

const fetchQuery = vi.fn();
vi.mock("convex/nextjs", () => ({ fetchQuery: (...args: unknown[]) => fetchQuery(...args) }));

const { FairModelPage } = await import("./fair-model-page");
const { FairLeadForm } = await import("./lead-form");
const { FAIR_REAL_MODEL_INTERACTIONS, fairModelPageFromPublic } = await import("./model-view");
const { FAIR_EMPTY_LEAD_DRAFT } = await import("./lead-form-model");

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
    { id: "g1", label: "TEST performanse", order: 1, items: [{ id: "s1", label: "TEST snaga", value: "TEST vrednost 1", order: 1, isHighlight: true }] },
  ],
  capabilities: { ratingMode: "dimensions", canSubmitInterest: true, canRequestTestDrive: true, hasAudienceQuestions: true, hasSurvey: true, isSponsored: true },
};

const open = (kind: "interest" | "test_drive", contactRequirement: "one_of" | "email" | "phone" | "both" = "one_of"): Extract<FairLeadFormView, { state: "open" }> => ({
  eventModelId: MODEL.id, kind, state: "open", contactRequirement, consent: { version: 4, text: "TEST saglasnost za TEST Izlagač A." },
});

const view = fairModelPageFromPublic(MODEL, { umbrellaTitle: fairModelSr.eventUmbrellaTitle });
const html = (element: ReactElement) => renderToStaticMarkup(element);

describe("FairModelPage — a real model", () => {
  test("server data, lead buttons for open forms, no rating, no Glas publike, no DEV controls", () => {
    const markup = html(
      <FairModelPage model={view} dict={fairModelSr} routePath="/sajam/test-elektromobilnost-2026/model/test-volta-x1-test-premium" leadForms={{ interest: open("interest"), testDrive: open("test_drive") }} interactions={FAIR_REAL_MODEL_INTERACTIONS} />,
    );
    for (const text of ["TEST Volta X1 TEST Premium", "TEST Volta", "TEST cena", "TEST vrednost 1", "TEST Sajam elektromobilnosti", fairModelSr.submitInterest, fairModelSr.requestTestDrive, fairModelSr.saveToGarage]) {
      expect(markup).toContain(text);
    }
    expect(markup).toContain('data-source="convex"');
    expect(markup).not.toContain("data-package");
    for (const hidden of [fairModelSr.audienceTitle, fairModelSr.rateModel, "glas-publike", fairModelSr.devLink, "fair-dev", "RS 3", "Audi", "showroom"]) {
      expect(markup).not.toContain(hidden);
    }
    // No photo: the finished tonal surface, never a stand-in car photo.
    expect(markup).toContain("fair-model-hero--no-photo");
    expect(markup).not.toContain("<img");
  });

  test("without an open form there is no lead button at all (never a broken one)", () => {
    const markup = html(
      <FairModelPage model={view} dict={fairModelSr} routePath="/x" leadForms={{ interest: null, testDrive: null }} interactions={FAIR_REAL_MODEL_INTERACTIONS} />,
    );
    expect(markup).not.toContain(fairModelSr.submitInterest);
    expect(markup).not.toContain(fairModelSr.requestTestDrive);
    expect(markup).not.toContain("fair-action-grid");
    expect(markup).toContain(fairModelSr.saveToGarage);
  });

  test("only interest open: one button", () => {
    const markup = html(
      <FairModelPage model={view} dict={fairModelSr} routePath="/x" leadForms={{ interest: open("interest"), testDrive: null }} interactions={FAIR_REAL_MODEL_INTERACTIONS} />,
    );
    expect(markup).toContain(fairModelSr.submitInterest);
    expect(markup).not.toContain(fairModelSr.requestTestDrive);
    expect(markup).toContain('data-count="1"');
  });
});

describe("FairLeadForm markup", () => {
  const form = (kind: "interest" | "testDrive", requirement: "one_of" | "email" | "phone" | "both" = "one_of") =>
    html(
      <FairLeadForm
        kind={kind}
        form={open(kind === "testDrive" ? "test_drive" : "interest", requirement)}
        eventModelId={MODEL.id}
        modelName="TEST Volta X1"
        exhibitorName="TEST Izlagač A"
        dict={fairModelSr}
        draft={FAIR_EMPTY_LEAD_DRAFT}
        onDraftChange={() => undefined}
        status={{ kind: "idle" }}
        onStatusChange={() => undefined}
        onClose={() => undefined}
      />,
    );

  test("name, email (confirmation address) and phone with mobile keyboards, autocomplete and server limits", () => {
    const markup = form("interest");
    expect(markup).toMatch(/autoComplete="name"/i);
    expect(markup).toMatch(/name="name"[^>]*maxLength="120"|maxLength="120"[^>]*name="name"/i);
    expect(markup).toMatch(/type="email"/);
    expect(markup).toMatch(/inputMode="email"/i);
    expect(markup).toMatch(/autoCapitalize="none"/i);
    expect(markup).toMatch(/spellCheck="false"/i);
    expect(markup).toMatch(/maxLength="254"/i);
    expect(markup).toMatch(/type="tel"/);
    expect(markup).toMatch(/inputMode="tel"/i);
    expect(markup).toMatch(/autoComplete="tel"/i);
    expect(markup).toMatch(/maxLength="32"/i);
    expect(markup).toContain(fairModelSr.leadEmailHint);
    expect(markup).toContain(fairModelSr.leadContactOneOf);
    expect(markup).toContain("data-autofocus");
  });

  test("consent from the server with Prihvatam / Odbijam; sending is disabled until Prihvatam", () => {
    const markup = form("interest");
    expect(markup).toContain("TEST saglasnost za TEST Izlagač A.");
    expect(markup).toContain(fairModelSr.leadConsentAccept);
    expect(markup).toContain(fairModelSr.leadConsentDecline);
    expect(markup.match(/type="radio"/g)).toHaveLength(2);
    expect(markup).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
    expect(markup).toContain(fairModelSr.leadConsentNeeded);
  });

  test("test drive: a request without any date or time field", () => {
    const markup = form("testDrive", "both");
    expect(markup).not.toMatch(/type="(date|time|datetime-local)"/);
    expect(markup).toContain(fairModelSr.sendTestDrive);
    expect(markup).toContain(fairModelSr.leadContactBoth);
    expect(markup).not.toContain(fairModelSr.leadOptional);
  });

  test("the rule decides which field is optional", () => {
    expect(form("interest", "email").match(new RegExp(fairModelSr.leadOptional, "g"))).toHaveLength(1);
    expect(form("interest", "one_of")).not.toContain(fairModelSr.leadOptional);
  });
});

describe("the model route", () => {
  // A block body: a function returned from beforeEach would be run as a teardown.
  beforeEach(() => {
    fetchQuery.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const route = async () => (await import("@/app/sajam/[eventSlug]/model/[modelSlug]/page")).default;
  const props = (eventSlug: string, modelSlug: string) => ({ params: Promise.resolve({ eventSlug, modelSlug }), searchParams: Promise.resolve({ mode: "free", photo: "1" }) });

  test("reads the model and both lead forms on the server; query parameters never change the capabilities", async () => {
    fetchQuery.mockImplementation(async (_ref: unknown, args: Record<string, string>) => {
      if ("modelSlug" in args) return MODEL;
      return args.kind === "interest" ? open("interest") : { eventModelId: MODEL.id, kind: "test_drive", state: "leads_disabled" };
    });
    const ModelPage = await route();
    const markup = html(await ModelPage(props("test-elektromobilnost-2026", "test-volta-x1-test-premium")));
    expect(fetchQuery).toHaveBeenCalledTimes(3);
    expect(fetchQuery.mock.calls.map((call) => call[1])).toEqual([
      { eventSlug: "test-elektromobilnost-2026", modelSlug: "test-volta-x1-test-premium" },
      { eventModelId: MODEL.id, kind: "interest" },
      { eventModelId: MODEL.id, kind: "test_drive" },
    ]);
    expect(markup).toContain(fairModelSr.submitInterest);
    expect(markup).not.toContain(fairModelSr.requestTestDrive);
    expect(markup).not.toContain('data-package="free"');
  });

  test("an unknown or unpublished model is notFound; the Audi demo is not served outside next dev", async () => {
    fetchQuery.mockResolvedValue(null);
    const ModelPage = await route();
    await expect(ModelPage(props("test-elektromobilnost-2026", "nepostojeci"))).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
    await expect(ModelPage(props("auto-moto-fest-2026", "audi-rs-3-sportback"))).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
  });

  test("a failed Convex read shows a calm retry state instead of crashing", async () => {
    fetchQuery.mockRejectedValue(new Error("offline"));
    const ModelPage = await route();
    const markup = html(await ModelPage(props("test-elektromobilnost-2026", "test-om-z1")));
    expect(markup).toContain(fairModelSr.unavailableTitle);
    expect(markup).toContain(fairModelSr.unavailableRetry);
  });

  test("metadata is noindex", async () => {
    fetchQuery.mockResolvedValue(null);
    const { generateMetadata } = await import("@/app/sajam/[eventSlug]/model/[modelSlug]/page");
    expect(await generateMetadata({ params: Promise.resolve({ eventSlug: "x", modelSlug: "y" }) })).toMatchObject({ robots: { index: false, follow: false } });
    fetchQuery.mockResolvedValue(MODEL);
    expect(await generateMetadata({ params: Promise.resolve({ eventSlug: "a", modelSlug: "b" }) })).toMatchObject({
      title: "TEST Volta X1 TEST Premium | TEST Sajam elektromobilnosti",
      robots: { index: false, follow: false },
    });
  });
});
