import type { FairClientSegment, FairPackageTier, FairModelStatus, FairParticipationStatus } from "@/lib/fair-contract";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";

// Sajam 2026 B1A — shared types of the admin `Događaji` sections. Since A2
// every section is its own route (components/admin/events/**): presentational
// views get these shapes from the Convex containers or from the static TEST
// preview. No visitor or contact PII is shown.

export type IssueView = { severity: "error" | "warning"; code: string; path: string };
export type Outcome = { ok: true; warnings?: IssueView[] } | { ok: false; code: string; issues?: IssueView[] };
export type Result<T> = { ok: true; value: T } | { ok: false; code: string; issues?: IssueView[] };

export type ModelView = {
  id: string;
  externalKey: string;
  displayName: string;
  variant?: string;
  slug: string;
  /** A3 — hierarchy ids: exhibitor = the participation, brand = the model's brandId. */
  participationId: string;
  brandId: string;
  brandName: string;
  exhibitorName: string;
  standLabel: string;
  tier: FairPackageTier;
  status: FairModelStatus;
  priceText: string;
  specCount: number;
  highlightCount: number;
  hasPhoto: boolean;
  /** A3 — external photo URL, if any (an uploaded photo has no URL in the admin catalog). */
  photoUrl: string | null;
  passportEligible: boolean;
  packageActivatedAt: number;
  qrCode: string | null;
  /** A3 — SMQ serial of the assigned code (null = unknown or no QR). */
  qrSmq: string | null;
  issues: IssueView[];
};

export type CatalogView = {
  days: { dateKey: string; label: string }[];
  participations: { id: string; externalKey: string; exhibitorName: string; codes: string; segment: FairClientSegment; status: FairParticipationStatus }[];
  stands: { id: string; externalKey: string; code: string; displayName: string; mapLocationId: string; exhibitorName: string; status: FairParticipationStatus }[];
  models: ModelView[];
  qrConfigured: boolean;
};

export type InventoryRowView = {
  cardId: string;
  resolverCode: string;
  smqCode: string | null;
  state: "active" | "inactive" | "problem" | null;
  assignment: { modelId: string; modelName: string | null; sameEvent: boolean } | null;
};

export type EventClientView = { accountId: string; name: string; smkCode: string | null };

export type Paged<T> = { rows: T[]; status: "loading" | "ready"; canLoadMore: boolean; loadingMore: boolean; onLoadMore: () => void };

export type ResolveView = { outcome: "fair_model" | "other" | "invalid"; problem: string | null; path: string | null };
type Counts = { new: number; existing: number };
export type DryRunView = { ok: boolean; issues: IssueView[]; summary: { participations: Counts; stands: Counts; models: Counts; upgrades: number; qrAssignments: number } };
type ResultCounts = { created: number; updated: number; unchanged: number };
export type CommitView = { committed: boolean; issues: IssueView[]; results: { participations: ResultCounts; stands: ResultCounts; models: ResultCounts; upgrades: number; qrAssignments: number } };

export type EventsActions = {
  publish: (modelId: string) => Promise<Outcome>;
  withdraw: (modelId: string) => Promise<Outcome>;
  upgrade: (modelId: string, toTier: FairPackageTier) => Promise<Outcome>;
  assignQr: (modelId: string, resolverCode: string) => Promise<Outcome>;
  releaseQr: (modelId: string, reason: string) => Promise<Outcome>;
  resolveTest: (resolverCode: string) => Promise<Result<ResolveView>>;
  dryRun: (payload: unknown) => Promise<Result<DryRunView>>;
  commit: (payload: unknown) => Promise<Result<CommitView>>;
  convert: (accountId: string) => Promise<Outcome>;
};

export function issueText(code: string) {
  if (code === "ACTION_FAILED") return dict.actionFailed;
  return code in dict.issues ? dict.issues[code as keyof typeof dict.issues] : fmt(dict.unknownIssue, { code });
}
