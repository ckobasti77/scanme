import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { CatalogView, IssueView, ModelView } from "@/components/admin/admin-events";

// Admin UX A2 — the event catalog as the section views see it. Pure; built
// from the three B1 admin queries (moved from admin-events-workspace.tsx).

export type EventCatalogData = FunctionReturnType<typeof api.fairAdmin.getEventCatalog>;
export type EventDirectoryData = FunctionReturnType<typeof api.fairAdmin.getEventDirectory>;
export type EventValidationData = FunctionReturnType<typeof api.fairAdmin.listValidationIssues>;

export const modelFullName = (model: { displayName: string; variant?: string }) => (model.variant ? `${model.displayName} ${model.variant}` : model.displayName);

export type EventQrCodesData = FunctionReturnType<typeof api.fairAdminStats.getModelQrCodes>;

/** Without `validation` (sections that do not show checks) every model has no issues; without `qrCodes` the SMQ is unknown. */
export function buildCatalogView(catalog: EventCatalogData, directory: EventDirectoryData, validation?: EventValidationData, qrCodes?: EventQrCodesData): CatalogView {
  const accounts = new Map(directory.accounts.map((row) => [row.accountId, row]));
  const businesses = new Map(directory.businesses.map((row) => [row.businessId, row]));
  const brands = new Map(directory.brands.map((row) => [row.brandId, row.name]));
  const participations = new Map(catalog.participations.map((row) => [row._id, row]));
  const stands = new Map(catalog.stands.map((row) => [row._id, row]));
  const qr = new Map(catalog.activeAssignments.map((row) => [row.eventModelId, row.resolverCode]));
  const issues = new Map((validation ?? []).map((row) => [row.eventModelId, row.issues as IssueView[]]));
  const smq = new Map((qrCodes ?? []).map((row) => [row.eventModelId, row.smqCode]));
  const exhibitor = (participationId: Id<"fairParticipations">) => {
    const participation = participations.get(participationId);
    return participation ? businesses.get(participation.businessId)?.name ?? accounts.get(participation.accountId)?.name ?? participation.externalKey : "—";
  };
  const models: ModelView[] = catalog.models.map((model) => {
    const stand = stands.get(model.standId);
    return {
      id: model._id,
      externalKey: model.externalKey,
      displayName: model.displayName,
      variant: model.variant,
      slug: model.slug,
      participationId: model.participationId,
      brandId: model.brandId,
      brandName: brands.get(model.brandId) ?? "—",
      exhibitorName: exhibitor(model.participationId),
      standLabel: stand ? `${stand.displayName} · ${stand.code}` : "—",
      tier: model.packageTier,
      status: model.status,
      priceText: model.priceText,
      specCount: model.specifications.length,
      highlightCount: model.specifications.filter((spec) => spec.isHighlight).length,
      hasPhoto: Boolean(model.photoUrl || model.photoStorageId),
      photoUrl: model.photoUrl ?? null,
      passportEligible: model.passportEligible,
      packageActivatedAt: model.packageActivatedAt,
      qrCode: qr.get(model._id) ?? null,
      qrSmq: smq.get(model._id) ?? null,
      issues: issues.get(model._id) ?? [],
    };
  }).sort((a, b) => a.exhibitorName.localeCompare(b.exhibitorName, "sr-Latn-RS") || a.displayName.localeCompare(b.displayName, "sr-Latn-RS"));
  return {
    days: [...catalog.days].sort((a, b) => a.sortOrder - b.sortOrder).map((day) => ({ dateKey: day.dateKey, label: day.label })),
    participations: catalog.participations.map((row) => {
      const account = accounts.get(row.accountId);
      const business = businesses.get(row.businessId);
      return {
        id: row._id,
        externalKey: row.externalKey,
        exhibitorName: business?.name ?? account?.name ?? row.externalKey,
        codes: [account?.smkCode, business?.smlCode].filter(Boolean).join(" · ") || "—",
        segment: account?.clientSegment ?? "standard",
        status: row.status,
      };
    }),
    stands: catalog.stands.map((row) => ({ id: row._id, externalKey: row.externalKey, code: row.code, displayName: row.displayName, mapLocationId: row.mapLocationId, exhibitorName: exhibitor(row.participationId), status: row.status })),
    models,
    qrConfigured: Boolean(catalog.event.qrInventoryBusinessId),
  };
}
