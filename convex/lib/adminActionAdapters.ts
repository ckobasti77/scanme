import type { Id } from "../_generated/dataModel";
import type {
  ActionPrioritySignals,
  ActionSeverity,
} from "../../lib/admin-v1/operational";

/**
 * Minimal seam for ADMIN-08/10/11/12. It describes an observed source fact,
 * but deliberately does not invent those future domains' statuses or events.
 */
export type DeferredActionDomain = "inbox" | "task" | "order" | "qr_nfc";

export type AutomaticActionAdapterInput = {
  readonly domain: "subscription" | DeferredActionDomain | "physical_product";
  readonly sourceRecordId: string;
  readonly causeKind: string;
  readonly sourceVersion: string;
  readonly isOpen: boolean;
  readonly accountId?: Id<"accounts">;
  readonly businessId?: Id<"businesses">;
  readonly serviceProfileId?: Id<"serviceProfiles">;
  readonly productRef?: string;
  readonly severity: ActionSeverity;
  readonly assigneeId?: Id<"users">;
  readonly dueAt?: number;
  readonly duePrecision?: "date" | "instant";
  readonly relevantAt: number;
  readonly priority: ActionPrioritySignals;
  readonly contextHref?: string;
  readonly description?: string;
};

export function defineDeferredActionAdapter<
  T extends AutomaticActionAdapterInput & { domain: DeferredActionDomain },
>(input: T): T {
  return input;
}
