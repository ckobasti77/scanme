import { internalQuery } from "./_generated/server";

// Root static route segments that shadow the dynamic `/[slug]` segment
// (RFC-001 §1.f). A business, service profile, or slug alias carrying one of
// these values is unreachable because the static route wins.
//
// - `m` and `r` are about to be reserved for `/m/[code]` and `/r/[cardCode]`.
// - `client-panel`, `dev`, `ponuda`, `preview-login` are already silently
//   shadowed today (their static routes exist, but they are not in
//   RESERVED_SLUGS), so this scan surfaces any pre-existing collision too.
//
// This query is READ-ONLY. It reserves nothing.
const SHADOWING_SEGMENTS = [
  "m",
  "r",
  "client-panel",
  "dev",
  "ponuda",
  "preview-login",
] as const;

export const scanShadowedSlugs = internalQuery({
  args: {},
  handler: async (ctx) => {
    const results = [];
    for (const segment of SHADOWING_SEGMENTS) {
      const [businesses, serviceProfiles, serviceSlugAliases, dynamicLinkAliases] =
        await Promise.all([
          ctx.db
            .query("businesses")
            .withIndex("by_slug", (q) => q.eq("slug", segment))
            .take(10),
          ctx.db
            .query("serviceProfiles")
            .withIndex("by_slug", (q) => q.eq("slug", segment))
            .take(10),
          ctx.db
            .query("serviceSlugAliases")
            .withIndex("by_slug", (q) => q.eq("slug", segment))
            .take(10),
          ctx.db
            .query("dynamicLinkAliases")
            .withIndex("by_slug", (q) => q.eq("slug", segment))
            .take(10),
        ]);
      const hits = {
        businesses: businesses.map((row) => row._id),
        serviceProfiles: serviceProfiles.map((row) => row._id),
        serviceSlugAliases: serviceSlugAliases.map((row) => row._id),
        dynamicLinkAliases: dynamicLinkAliases.map((row) => row._id),
      };
      const collision =
        businesses.length > 0 ||
        serviceProfiles.length > 0 ||
        serviceSlugAliases.length > 0 ||
        dynamicLinkAliases.length > 0;
      results.push({ segment, collision, hits });
    }
    const collisions = results.filter((row) => row.collision);
    return {
      scannedSegments: [...SHADOWING_SEGMENTS],
      collisionCount: collisions.length,
      clean: collisions.length === 0,
      collisions,
      results,
    };
  },
});
