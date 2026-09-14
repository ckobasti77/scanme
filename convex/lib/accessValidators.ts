import { v } from "convex/values";

export const accessKind = v.union(v.literal("qr"), v.literal("nfc"));
export const accessState = v.union(v.literal("active"), v.literal("inactive"), v.literal("problem"));
export const accessColor = v.union(v.literal("green"), v.literal("orange"), v.literal("red"), v.literal("gray"));
export const accessHealth = v.union(v.literal("healthy"), v.literal("unverified"), v.literal("broken"));
export const accessDestinationInput = v.union(
  v.object({ kind: v.literal("services"), serviceProfileIds: v.array(v.id("serviceProfiles")) }),
  v.object({ kind: v.literal("dynamic_link"), dynamicLinkId: v.id("dynamicLinks") }),
);
export const accessDestinationKind = v.union(
  v.literal("service"), v.literal("links_splitter"), v.literal("generic_splitter"),
  v.literal("dynamic_url"), v.literal("legacy"),
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
