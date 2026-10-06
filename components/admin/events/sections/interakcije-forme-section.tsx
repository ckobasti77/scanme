"use client";

import { useMutation, useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { modelFullName } from "@/components/admin/events/event-catalog";
import { useAdminEvent } from "@/components/admin/events/event-context";
import { attempt } from "@/components/admin/events/event-outcome";
import { EventLeadFormsView, type LeadFormsActions } from "@/components/admin/events/sections/interakcije-forme-view";
import { eventSectionHref } from "@/lib/admin-v1/event-sections";
import type { AdminQueryPatch, AdminQueryState } from "@/lib/admin-v1/query-state";
import type { FairLeadKind } from "@/lib/fair-contract";

// Admin UX A7 — Forme (moved from Leadovi): the exhibitor defaults, the real
// state of every model and the read-only state of the K3 switch and the
// consent (convex/fairLeadsAdmin.ts). Each write is one of the A7/B4
// mutations; "Primeni na sve modele" is one transaction. Izlagači 2026: the
// part `#forme` of the exhibitor's Interakcije page (no exhibitor select).

export function useLeadFormsActions(): LeadFormsActions {
  const saveDefault = useMutation(api.fairLeadsAdmin.upsertParticipationLeadDefault);
  const apply = useMutation(api.fairLeadsAdmin.applyLeadDefaultsToModels);
  const saveOverride = useMutation(api.fairLeadsAdmin.upsertLeadConfig);
  const clearOverride = useMutation(api.fairLeadsAdmin.clearLeadOverride);
  return {
    saveDefault: async (participationId, kind, values) => {
      const result = await attempt(() => saveDefault({
        participationId: participationId as Id<"fairParticipations">, leadKind: kind, enabled: values.enabled, contactRequirement: values.contactRequirement,
        ...(values.preferredContact ? { preferredContact: values.preferredContact } : {}),
      }));
      return result.ok ? { ok: true } : result;
    },
    apply: async (participationId) => {
      const result = await attempt(() => apply({ participationId: participationId as Id<"fairParticipations"> }));
      if (!result.ok) return result;
      const value = result.value;
      return {
        ok: true,
        applied: {
          created: value.created, updated: value.updated, unchanged: value.unchanged, skippedOverride: value.skippedOverride,
          notEntitled: value.notEntitled.map((row) => ({ modelId: row.eventModelId as string, kind: row.leadKind })), missingDefault: value.missingDefault,
        },
      };
    },
    saveOverride: async (modelId, kind, values) => {
      const result = await attempt(() => saveOverride({
        eventModelId: modelId as Id<"fairEventModels">, leadKind: kind, enabled: values.enabled, contactRequirement: values.contactRequirement,
        ...(values.preferredContact ? { preferredContact: values.preferredContact } : {}),
      }));
      return result.ok ? { ok: true } : result;
    },
    clearOverride: async (modelId, kind) => {
      const result = await attempt(() => clearOverride({ eventModelId: modelId as Id<"fairEventModels">, leadKind: kind }));
      return result.ok ? { ok: true } : result;
    },
  };
}

/** Izlagači 2026 — Forme of one exhibitor (`query.model` = the car whose exception is open). */
export function ExhibitorFormsPart({ exhibitor, query, onQueryChange }: { exhibitor: { id: string; name: string }; query: AdminQueryState; onQueryChange: (patch: AdminQueryPatch) => void }) {
  const { eventId, base, catalog, directory } = useAdminEvent();
  const forms = useQuery(api.fairLeadsAdmin.getEventLeadForms, { eventId });
  const switches = useQuery(api.fairLeadsAdmin.getLeadSwitches, {});
  const consentRows = useQuery(api.fairLeadsAdmin.getEventConsents, { eventId });
  const actions = useLeadFormsActions();
  const names = useMemo(() => {
    const brands = new Map(directory.brands.map((row) => [row.brandId as string, row.name]));
    return { models: new Map(catalog.models.map((model) => [model._id as string, { name: modelFullName(model), brandName: brands.get(model.brandId) ?? "—" }])) };
  }, [catalog, directory]);
  const consents = useMemo(() => {
    if (!consentRows) return undefined;
    const active = (kind: FairLeadKind) => consentRows.find((row) => row.leadKind === kind && row.status === "active")?.version ?? null;
    return { interest: active("interest"), test_drive: active("test_drive") };
  }, [consentRows]);
  return (
    <EventLeadFormsView
      source={forms}
      names={names}
      exhibitors={[exhibitor]}
      switches={switches}
      consents={consents}
      consentHref={eventSectionHref(base, "leadovi/podesavanja")}
      query={query}
      onQueryChange={onQueryChange}
      actions={actions}
      scoped
    />
  );
}
