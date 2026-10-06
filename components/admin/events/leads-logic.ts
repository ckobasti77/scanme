import { fairFollowUpUnknownField, renderFairFollowUp, type FairFollowUpValues } from "@/convex/lib/fairFollowUp";
import { sanitizeHierarchyValue, type HierarchyData } from "@/lib/admin-v1/hierarchy";
import type { AdminQueryPatch, AdminQueryState } from "@/lib/admin-v1/query-state";
import { belgradeLocalToEpoch, belgradeParts } from "@/lib/belgrade-time";
import { FAIR_LEAD_DELIVERY_DEADLINE_MS, type FairLeadKind } from "@/lib/fair-contract";
import { fmt } from "@/lib/i18n/format";
import { eventLeadEmailSr } from "@/lib/i18n/sr/event-lead-email";

// Admin UX A8 — pure logic of the lead screens (`leadovi`, `leadovi/follow-up`):
// query string → inbox filter, the 15 Nov delivery deadline, merge-field
// insertion and the follow-up email preview. Tested in
// components/admin/events/sections/leadovi-*.test.tsx.

/** What the inbox asks fairLeadsInbox.listEventLeads for (model › exhibitor › event) plus a brand narrowed on the screen. */
export type LeadInboxFilter = {
  participationId?: string;
  eventModelId?: string;
  kind?: FairLeadKind;
  delivered?: boolean;
  /** Epoch ms, inclusive (start of the `od` day in Belgrade). */
  from?: number;
  /** Epoch ms, exclusive (start of the day after `do`). */
  to?: number;
  /** A brand without one model: the screen keeps only these models. */
  brandModelIds?: ReadonlySet<string>;
};

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function dayStart(dateKey: string, plusDays = 0): number | undefined {
  const match = DATE.exec(dateKey);
  if (!match) return undefined;
  const day = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + plusDays));
  const key = day.toISOString().slice(0, 10);
  return belgradeLocalToEpoch(`${key}T00:00`) ?? undefined;
}

export const LEAD_KIND_PARAM: Record<FairLeadKind, "zainteresovan" | "probna-voznja"> = { interest: "zainteresovan", test_drive: "probna-voznja" };

export function leadInboxFilter(query: AdminQueryState, hierarchy: HierarchyData): LeadInboxFilter {
  const value = sanitizeHierarchyValue(hierarchy, { exhibitorId: query.izlagac, brandId: query.brend, modelId: query.model });
  const kind = query.tip === "zainteresovan" ? "interest" : query.tip === "probna-voznja" ? "test_drive" : undefined;
  const delivered = query.isporuka === "da" ? true : query.isporuka === "ne" ? false : undefined;
  const from = query.od ? dayStart(query.od) : undefined;
  const to = query.do ? dayStart(query.do, 1) : undefined;
  const brandModelIds = value.brandId && !value.modelId
    ? new Set(hierarchy.models.filter((model) => model.brandId === value.brandId && (!value.exhibitorId || model.exhibitorId === value.exhibitorId)).map((model) => model.id))
    : undefined;
  return {
    ...(value.modelId ? { eventModelId: value.modelId } : value.exhibitorId ? { participationId: value.exhibitorId } : {}),
    ...(kind ? { kind } : {}),
    ...(delivered !== undefined ? { delivered } : {}),
    ...(from !== undefined ? { from } : {}),
    ...(to !== undefined ? { to } : {}),
    ...(brandModelIds ? { brandModelIds } : {}),
  };
}

/** Clears every inbox filter (keeps `prikaz`). */
export function clearLeadInboxPatch(): AdminQueryPatch {
  return { izlagac: null, brend: null, model: null, tip: null, isporuka: null, od: null, do: null, lead: null };
}

export function hasLeadInboxFilter(query: AdminQueryState): boolean {
  return Boolean(query.izlagac || query.brend || query.model || query.tip || query.isporuka || query.od || query.do);
}

export type LeadDeadline = { kind: "days"; days: number } | { kind: "today" } | { kind: "passed" };

/** Calendar days (Belgrade) until 15 Nov 2026, the last day to hand leads over (MASTER §13). */
export function leadDeliveryDeadline(now: number): LeadDeadline {
  if (now > FAIR_LEAD_DELIVERY_DEADLINE_MS) return { kind: "passed" };
  const today = belgradeParts(now);
  const last = belgradeParts(FAIR_LEAD_DELIVERY_DEADLINE_MS);
  const days = Math.round((Date.UTC(last.year, last.month - 1, last.day) - Date.UTC(today.year, today.month - 1, today.day)) / 86_400_000);
  return days <= 0 ? { kind: "today" } : { kind: "days", days };
}

/** Inserts `value` over the selection [start, end) and returns the new text and caret. */
export function insertAtCursor(text: string, start: number, end: number, value: string): { text: string; caret: number } {
  const from = Math.max(0, Math.min(start, text.length));
  const to = Math.max(from, Math.min(end, text.length));
  return { text: `${text.slice(0, from)}${value}${text.slice(to)}`, caret: from + value.length };
}

export type FollowUpTextState = "active" | "draft" | "none";

/** The state shown for an exhibitor: an active text wins; otherwise a draft; otherwise none. */
export function followUpTextState(row: { active: unknown | null; draft: unknown | null }): FollowUpTextState {
  return row.active ? "active" : row.draft ? "draft" : "none";
}

/** The exhibitor shown in the follow-up editor: `?izlagac=`, else the first with an Advanced model, else the first. */
export function pickFollowUpExhibitor<T extends { participationId: string; advancedModels: number }>(rows: readonly T[] | undefined, chosen: string | undefined): T | null {
  if (!rows?.length) return null;
  return rows.find((row) => row.participationId === chosen) ?? rows.find((row) => row.advancedModels > 0) ?? rows[0];
}

export type FollowUpPreview = { subject: string; paragraphs: string[] } | { problem: string } | null;

/**
 * The follow-up as the visitor reads it: the exhibitor's text with the merge
 * values, then the ScanMe footer and signature (convex/lib/fairEmails.ts
 * compose). Null while subject or text is empty; `problem` = an unknown field.
 */
export function followUpPreview(text: { subject: string; plainText: string }, values: FairFollowUpValues, names: { exhibitor: string; event: string }): FollowUpPreview {
  if (!text.subject.trim() || !text.plainText.trim()) return null;
  const unknown = fairFollowUpUnknownField(text);
  if (unknown !== null) return { problem: unknown };
  const rendered = renderFairFollowUp(text, values);
  const body = rendered.plainText.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
  const model = values.modeli?.trim() || eventLeadEmailSr.followUpFallbacks.modeli;
  return {
    subject: rendered.subject,
    paragraphs: [...body, fmt(eventLeadEmailSr.followUpFooter, { exhibitor: names.exhibitor, event: names.event, model }), eventLeadEmailSr.signature],
  };
}
