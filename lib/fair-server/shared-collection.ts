import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { FAIR_SHARE_CODE_PATTERN, type FairPublicModel } from "@/lib/fair-contract";
import { fairShareCodeHash } from "./sharing";

export type FairSharedCollection = {
  id: string;
  eventId: string;
  eventModelIds: string[];
  expiresAt: number;
  models: FairPublicModel[];
};

export async function readFairSharedCollection(shareCode: string): Promise<FairSharedCollection | null> {
  if (!FAIR_SHARE_CODE_PATTERN.test(shareCode)) return null;
  try {
    const collection = await fetchQuery(api.fairSharing.getShareCollectionByCodeHash, {
      codeHash: fairShareCodeHash(shareCode),
      now: Date.now(),
    });
    if (!collection) return null;
    const models = await fetchQuery(api.fairPublic.getModelsByIds, { ids: collection.eventModelIds });
    return { ...collection, models };
  } catch {
    return null;
  }
}
