/// <reference types="vite/client" />

// Proves the pure TS block model (lib/venue-blocks.ts) agrees with the Convex
// validators (convex/lib/venueValidators.ts): every `defaults(type)` and the
// default Venue design are inserted into the real `venueEventConfigs` schema,
// which validates `draftBlocks` against `venueBlockValidator` and `draftDesign`
// against `venueDesignValidator`. A shape mismatch makes the insert throw.

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { DEFAULT_VENUE_DESIGN } from "../lib/design-engine/venue-tokens";
import {
  defaults,
  VENUE_BLOCK_TYPES,
  type VenueBlock,
} from "../lib/venue-blocks";
import type { Doc } from "./_generated/dataModel";
import schema from "./schema";

// The pure block model types storage ids as `string`; the schema brands them
// `Id<"_storage">` (a compile-time-only brand). Cast at the insert boundary —
// the validator still checks the runtime shape, which is what this test proves.
type StoredBlocks = Doc<"venueEventConfigs">["draftBlocks"];
const asStored = (blocks: VenueBlock[]) => blocks as unknown as StoredBlocks;

const modules = import.meta.glob("./**/*.ts");

async function seedConfigShell(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const businessId = await ctx.db.insert("businesses", {
      name: "Klub Barok",
      slug: "klub-barok",
      status: "active",
      createdAt: now,
    });
    const venueProfileId = await ctx.db.insert("serviceProfiles", {
      businessId,
      type: "scanme_venue",
      slug: `${"klub-barok"}-venue`,
      status: "active",
      totalScans: 0,
      totalPageViews: 0,
      totalConvertedSessions: 0,
      createdAt: now,
      updatedAt: now,
    });
    const eventId = await ctx.db.insert("events", {
      businessId,
      slug: "nova-godina",
      title: "Nova godina",
      status: "draft",
      lifecycleRevision: 0,
      createdAt: now,
      updatedAt: now,
    });
    return { eventId, venueProfileId };
  });
}

function assignIds(block: VenueBlock, index: number): VenueBlock {
  return { ...block, base: { ...block.base, id: `block-${index}` } };
}

describe("venue validators (schema agreement)", () => {
  test("every defaults(type) validates as a venueBlockValidator member", async () => {
    const t = convexTest(schema, modules);
    const { eventId, venueProfileId } = await seedConfigShell(t);

    const blocks = VENUE_BLOCK_TYPES.map((type, index) =>
      assignIds(defaults(type), index),
    );

    const configId = await t.run(async (ctx) =>
      ctx.db.insert("venueEventConfigs", {
        eventId,
        venueProfileId,
        draftDesign: DEFAULT_VENUE_DESIGN,
        draftBlocks: asStored(blocks),
        hasUnpublishedChanges: true,
        draftRevision: 1,
        publishedRevision: 0,
        updatedAt: Date.now(),
      }),
    );

    const stored = await t.run(async (ctx) => ctx.db.get(configId));
    expect(stored?.draftBlocks).toHaveLength(VENUE_BLOCK_TYPES.length);
    expect(stored?.draftDesign?.version).toBe(1);
  });

  test("each block type inserts individually (per-type shape check)", async () => {
    const t = convexTest(schema, modules);
    const { eventId, venueProfileId } = await seedConfigShell(t);

    for (const type of VENUE_BLOCK_TYPES) {
      const block = assignIds(defaults(type), 0);
      await expect(
        t.run(async (ctx) =>
          ctx.db.insert("venueEventConfigs", {
            eventId,
            venueProfileId,
            draftBlocks: asStored([block]),
            hasUnpublishedChanges: true,
            draftRevision: 1,
            publishedRevision: 0,
            updatedAt: Date.now(),
          }),
        ),
      ).resolves.toBeDefined();
    }
  });
});
