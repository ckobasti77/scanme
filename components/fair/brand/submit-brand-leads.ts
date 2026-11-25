"use client";

// Sajam 2026 — the brand page sends one lead per chosen model: a visitor can
// tick several models of the same exhibitor at once ("interest" for a lineup,
// "testDrive" for the cars they want to try). Every model gets its own POST
// /api/fair/lead, one after the other (never Promise.all: the gateway is
// single-threaded per visitor and RATE_LIMITED is a real answer), in the order
// the visitor chose. `submissionIds` is the caller's persistent map id ->
// client idempotency key; the same object is passed again on retry, so a model
// that failed keeps its submissionId and the server sees the same key instead
// of a second lead. Bodies match components/fair/lead-sheet.tsx exactly.

import { postFair, newFairSubmissionId } from "@/lib/fair-client/fair-api";
import type { ContactPayload } from "@/lib/fair-client/contact-form";
import type { FairErrorCode, FairLeadSubmitResult } from "@/lib/fair-contract";

export type BrandLeadKind = "testDrive" | "interest";

export type BrandLeadResult = { eventModelId: string; ok: true } | { eventModelId: string; ok: false; code: FairErrorCode };

export async function submitBrandLeads(
  input: {
    kind: BrandLeadKind;
    eventModelIds: string[];
    contact: ContactPayload;
    consentVersionById: Record<string, number>;
    submissionIds: Record<string, string>; // the same object is passed again on a retry
  },
  post: typeof postFair = postFair,
): Promise<BrandLeadResult[]> {
  const results: BrandLeadResult[] = [];
  for (const id of input.eventModelIds) {
    const result = await post<FairLeadSubmitResult>("/api/fair/lead", {
      eventModelId: id,
      kind: input.kind === "testDrive" ? "test_drive" : "interest",
      submissionId: (input.submissionIds[id] ??= newFairSubmissionId()),
      ...input.contact,
      consentAccepted: true,
      consentVersion: input.consentVersionById[id],
    });
    results.push(result.ok ? { eventModelId: id, ok: true } : { eventModelId: id, ok: false, code: result.code });
  }
  return results;
}
