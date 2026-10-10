// Sajam 2026 D1 — SSR markup of Aleksa's model page (5532038) for the real
// intake models (RN N1): a photo URL on another host than ScanMe's never
// goes through /_next/image (next.config allows only *.convex.cloud and
// scanme.rs/fair, so it would answer 400 in production), while ScanMe's own
// /fair/ photos stay local and optimized. Also checks what D1 keeps free for
// the new-stamp card: nothing but the identity block in the lower hero, and
// the survey chat head as the hero's last (top-right, absolute) child.

import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import type { FairPublicModel } from "@/lib/fair-contract";
import { fairPublicModelToFixture } from "@/lib/fair-client/model-fixtures";
import { fairModelSr } from "@/lib/i18n/sr/fair-model";
import payload from "@/docs/events/sajam-automobila-2026/intake/elektromobilnost-2026-2026-10-07/b1-payload.json";

// Same src rule as next/image with the default loader: optimized → /_next/image?url=…
vi.mock("next/image", () => ({
  default: ({ src, alt, className, unoptimized }: { src: string; alt: string; className?: string; unoptimized?: boolean }) =>
    createElement("img", {
      src: unoptimized ? src : `/_next/image?url=${encodeURIComponent(src)}&w=828&q=75`,
      alt,
      className,
      "data-unoptimized": unoptimized ? "true" : "false",
    }),
}));

const { FairModelPage } = await import("./fair-model-page");

type IntakeModel = {
  displayName: string;
  slug: string;
  priceText: string;
  photoUrl?: string;
  specifications: Array<{ label: string; value: string; order: number }>;
};

/** The 15 real models of the intake as getModelBySlug would project them. */
const REAL_MODELS: FairPublicModel[] = payload.participations.flatMap((participation) =>
  participation.brands.flatMap((brand) =>
    (brand.models as IntakeModel[]).map((model) => ({
      id: `model-${model.slug}`,
      eventId: "event-elektromobilnost-2026",
      eventSlug: payload.eventCode,
      eventTitle: "Sajam elektromobilnosti",
      participationId: participation.externalKey,
      exhibitorName: participation.externalKey,
      brandId: brand.externalKey,
      brandName: brand.name,
      standId: brand.stand.externalKey,
      standMapLocationId: brand.stand.mapLocationId,
      slug: model.slug,
      displayName: model.displayName,
      priceText: model.priceText,
      specificationGroups: [
        {
          id: "general",
          label: "",
          order: 0,
          items: model.specifications.map((spec) => ({ id: `s${spec.order}`, label: spec.label, value: spec.value, order: spec.order, isHighlight: spec.order <= 4 })),
        },
      ],
      ...(model.photoUrl ? { photoUrl: model.photoUrl } : {}),
      capabilities: { ratingMode: "dimensions", canSubmitInterest: true, canRequestTestDrive: true, hasAudienceQuestions: false, hasSurvey: false, isSponsored: false },
    })),
  ),
);

function render(model: FairPublicModel, siteOrigin?: string): string {
  const adapted = fairPublicModelToFixture({
    model,
    publicEventSlug: model.eventSlug,
    eventName: "Sajam elektromobilnosti 2026",
    withPhoto: true,
    photoPresentation: "left",
    siteOrigin,
  });
  const element: ReactElement = (
    <FairModelPage
      model={adapted.model}
      dict={fairModelSr}
      routePath={`/sajam/${model.eventSlug}/model/${model.slug}`}
      selection={{ mode: adapted.mode, withPhoto: true, alignment: "left" }}
      showDevPanel={false}
      interactions={null}
      openSurvey={false}
      stand={null}
      audienceTeaser={null}
    />
  );
  return renderToStaticMarkup(element);
}

function heroImage(markup: string): { src: string; unoptimized: string } | null {
  const match = markup.match(/<img src="([^"]*)"[^>]*class="fair-model-hero__image"[^>]*data-unoptimized="(true|false)"/);
  return match ? { src: match[1].replaceAll("&amp;", "&"), unoptimized: match[2] } : null;
}

describe("model page photo of a real car (RN N1)", () => {
  test("the intake has the 15 real models, each with a ScanMe /fair/ photo", () => {
    expect(REAL_MODELS).toHaveLength(15);
    for (const model of REAL_MODELS) expect(model.photoUrl).toMatch(/^https:\/\/scanme\.rs\/fair\/elektromobilnost-2026\//);
  });

  test("an exhibitor's own photo URL is loaded directly, never through /_next/image", () => {
    for (const model of REAL_MODELS) {
      const external = `https://www.izlagac.example/slike/${model.slug}.webp`;
      const markup = render({ ...model, photoUrl: external });
      expect(heroImage(markup)).toEqual({ src: external, unoptimized: "true" });
      expect(markup).not.toContain("/_next/image");
    }
  });

  test("Convex storage and protocol-relative URLs are loaded directly too", () => {
    const [model] = REAL_MODELS;
    for (const url of ["https://expert-pelican-136.convex.cloud/api/storage/abc", "//cdn.izlagac.example/a.jpg", "http://izlagac.example/a.jpg"]) {
      expect(heroImage(render({ ...model, photoUrl: url }))).toEqual({ src: url, unoptimized: "true" });
    }
  });

  test("ScanMe's own /fair/ photo (intake URL) stays a local, optimized path", () => {
    for (const model of REAL_MODELS) {
      const local = model.photoUrl!.slice("https://scanme.rs".length);
      expect(heroImage(render(model))).toEqual({ src: `/_next/image?url=${encodeURIComponent(local)}&w=828&q=75`, unoptimized: "false" });
    }
    // The request origin is ScanMe's too (preview/LAN host).
    const [model] = REAL_MODELS;
    const onPreview = { ...model, photoUrl: `http://localhost:3150${model.photoUrl!.slice("https://scanme.rs".length)}` };
    expect(heroImage(render(onPreview, "http://localhost:3150"))?.unoptimized).toBe("false");
  });
});

describe("room for the new-stamp card (Aleksa §2.2)", () => {
  test("the hero holds only the photo, scrim, identity and the survey slot — nothing fixed or floating in its lower part", () => {
    const [model] = REAL_MODELS;
    const markup = render(model);
    const hero = markup.match(/<section class="fair-model-hero[^"]*"[^>]*>([\s\S]*?)<\/section>/)?.[1] ?? "";
    expect(hero).toContain("fair-model-hero__image");
    expect(hero).toContain("fair-model-hero__scrim");
    expect(hero).toContain("fair-model-identity");
    // Only these three top-level parts are server-rendered (model page v2: the identity holds the
    // name and the price); the survey head mounts client-side top right.
    const classes = [...hero.matchAll(/class="([^"]+)"/g)].map((m) => m[1].split(" ")[0]);
    expect(new Set(classes)).toEqual(
      new Set(["fair-model-hero__image", "fair-model-hero__scrim", "fair-model-identity", "fair-model-identity__name", "fair-model-price"]),
    );
    expect(markup).not.toMatch(/position:\s*fixed/);
  });
});
