import { v } from "convex/values";

export const accessKind = v.union(v.literal("qr"), v.literal("nfc"));
export const accessState = v.union(v.literal("active"), v.literal("inactive"), v.literal("problem"));
export const accessColor = v.union(v.literal("green"), v.literal("orange"), v.literal("red"), v.literal("gray"));
export const accessHealth = v.union(v.literal("healthy"), v.literal("unverified"), v.literal("broken"));
export const accessDestinationInput = v.union(
  v.object({ kind: v.literal("services"), serviceProfileIds: v.array(v.id("serviceProfiles")) }),
  v.object({ kind: v.literal("dynamic_link"), dynamicLinkId: v.id("dynamicLinks") }),
);
// Sajam 2026 B1 (HANDOFF §5.1): an event QR inventory subject resolves to one
// fair event model. Only the fairAdmin QR assignment writes it, so the generic
// access APIs keep accepting accessDestinationInput, which excludes it.
export const fairModelDestinationInput = v.object({ kind: v.literal("fair_model"), eventModelId: v.id("fairEventModels") });
export const accessSubjectDestinationInput = v.union(...accessDestinationInput.members, fairModelDestinationInput);
export const accessDestinationKind = v.union(
  v.literal("service"), v.literal("links_splitter"), v.literal("generic_splitter"),
  v.literal("dynamic_url"), v.literal("legacy"), v.literal("fair_model"),
);
export const accessActor = v.union(
  v.object({ kind: v.literal("admin"), userId: v.id("users") }),
  v.object({ kind: v.literal("system"), source: v.string() }),
);
export const accessAttribution = {
  accessChannelId: v.optional(v.id("accessChannels")),
  accessSubjectId: v.optional(v.id("accessSubjects")),
  physicalProductId: v.optional(v.id("physicalProducts")),
  digitalQrId: v.optional(v.id("digitalQrCodes")),
  placementId: v.optional(v.id("productPlacements")),
  destinationId: v.optional(v.id("cardTargets")),
};
export const ACCESS_BATCH = 50;
export const PROVISION_BATCH = 50;
// Additional QR identities preserve already distributed SMQ tokens on linking.
export const SUBJECT_CHANNEL_LIMIT = 8;
