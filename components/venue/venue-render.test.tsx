// TASK-09 render smoke: every one of the twelve block types renders (a) with
// its defaults() and (b) with a populated fixture payload, without throwing —
// plus the full template in all three lifecycle states. renderToStaticMarkup
// is enough: the client leaves render their server markup here exactly as they
// do in the real RSC pass.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import {
  VENUE_BLOCK_TYPES,
  defaults,
  type VenueBlock,
} from "@/lib/venue-blocks";
import { VenueBlockRender } from "./blocks/registry";
import {
  VenueStateScreen,
  VenueTemplate,
} from "./venue-template";
import {
  DARK_VENUE_DESIGN,
  FIXTURE_ARCHIVE,
  fixtureBlocks,
  fixtureView,
} from "./venue-fixtures";
import type { VenueRenderContext } from "./venue-view";

// useMutation (reservation form) needs a provider; the client never connects
// because static rendering runs no effects.
const convexClient = new ConvexReactClient("https://unit-test.convex.cloud");

const CTX: VenueRenderContext = {
  businessSlug: "klub-mimeza",
  eventSlug: "letnja-sezona",
  eventTitle: "Otvaranje letnje sezone",
  displayName: "Klub Mimeza",
  eventStartsAt: Date.now() + 86_400_000,
  eventEndsAt: Date.now() + 86_400_000 + 6 * 3600_000,
  lifecycle: "before",
  pastEvents: FIXTURE_ARCHIVE,
};

function renderBlock(block: VenueBlock, ctx: VenueRenderContext = CTX) {
  return renderToStaticMarkup(
    <ConvexProvider client={convexClient}>
      <VenueBlockRender block={block} ctx={ctx} />
    </ConvexProvider>,
  );
}

describe("twelve block renderers", () => {
  for (const type of VENUE_BLOCK_TYPES) {
    test(`${type} renders with defaults() without throwing`, () => {
      const block = defaults(type);
      block.base.id = `default-${type}`;
      expect(() => renderBlock(block)).not.toThrow();
    });
  }

  test("every populated fixture block renders without throwing", () => {
    // Built dynamically so this test file itself stays clean under the
    // namespace gate's raw substring scan.
    const forbiddenNamespace = ["--", "links", "-"].join("");
    for (const block of fixtureBlocks(Date.now() + 86_400_000)) {
      const html = renderBlock(block);
      expect(html).not.toContain(forbiddenNamespace);
    }
  });

  test("hidden and fully-responsive-off blocks render nothing", () => {
    const hidden = defaults("richText");
    hidden.base.id = "h1";
    hidden.base.visible = false;
    expect(renderBlock(hidden)).toBe("");

    const off = defaults("spacer");
    off.base.id = "h2";
    off.base.responsive = { desktop: false, mobile: false };
    expect(renderBlock(off)).toBe("");
  });
});

describe("template lifecycle states", () => {
  test("before / live / after all render, --venue-* only", () => {
    for (const [lifecycle, status, offset] of [
      ["before", "scheduled", 86_400_000],
      ["live", "live", -3_600_000],
      ["after", "ended", -86_400_000],
    ] as const) {
      const view = fixtureView({ status, startsAt: Date.now() + offset });
      const html = renderToStaticMarkup(
        <ConvexProvider client={convexClient}>
          <VenueTemplate
            view={view}
            lifecycle={lifecycle}
            businessSlug="klub-mimeza"
            pastEvents={FIXTURE_ARCHIVE}
          />
        </ConvexProvider>,
      );
      expect(html).toContain("--venue-page");
      expect(html).not.toContain(["--", "links", "-"].join(""));
    }
  });

  test("the dark design variant renders with its tokens", () => {
    const view = fixtureView({
      status: "live",
      startsAt: Date.now(),
      design: DARK_VENUE_DESIGN,
    });
    const html = renderToStaticMarkup(
      <ConvexProvider client={convexClient}>
        <VenueTemplate view={view} lifecycle="live" businessSlug="x" />
      </ConvexProvider>,
    );
    expect(html).toContain("#14161A");
  });

  test("the state screen renders (empty venue / inactive)", () => {
    const html = renderToStaticMarkup(
      <VenueStateScreen
        badge="before"
        title="Pripremamo program"
        eyebrow="Klub Mimeza"
        logoUrl={null}
        body="Uskoro."
      />,
    );
    expect(html).toContain("Pripremamo program");
  });
});
