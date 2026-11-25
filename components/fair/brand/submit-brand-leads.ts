// Sajam 2026 — what the brand page's sheet does on Pošalji (card 05 §1, §7): one lead per
// model the visitor selected, in their order, one call after another. Nothing here invents
// a send path, a consent rule or a lead record — it calls the model page's own send
// (components/fair/lead-form-model.ts) once per model, with the same body and the same
// client idempotency key. The consent the visitor just gave in this sheet is the single
// consent for every model (card 05 §1); name + contact come from one row above the list
// (card 05 §5), not from each model.

import {
  fairLeadRequestBody,
  fairNewSubmissionId,
  sendFairLead,
  type FairLeadFormValues,
  type FairLeadOutcome,
  type FairLeadSheetKind,
} from "../lead-form-model";

export type BrandLeadTarget = {
  eventModelId: string;
  /** Which form this row was submitted from (card 05 §1): a model in the drive list goes as a
   * test drive, everything else as interest. `canRequestTestDrive` decides which is possible. */
  kind: FairLeadSheetKind;
};

export type BrandLeadReceipt = {
  eventModelId: string;
  kind: FairLeadSheetKind;
  submissionId: string;
  /** Exactly the outcome the model page would show for this one model (lead-form-model):
   * `success` means the gateway confirmed it; anything else is what the row shows inline. */
  outcome: FairLeadOutcome;
};

export type BrandLeadBatch = {
  /** Every model this send touched, in the order it sent them. */
  receipts: BrandLeadReceipt[];
  /** eventModelIds whose outcome is `success` — their pill becomes "Poslano" and the box unchecks (card 05 §7). */
  sentIds: string[];
  /** Everything that did not go through, in send order. `retryBrandLeads` sends these and only these. */
  failed: BrandLeadReceipt[];
};

type BrandLeadBatchInput = {
  /** The contact, once for the whole send (card 05 §5). */
  values: FairLeadFormValues;
  /** The consent version the visitor just accepted — one answer for all the models (card 05 §1). */
  consentVersion: number;
  /** The browser's fetch, so a test can watch every call. Production passes nothing: globalThis.fetch. */
  fetchImpl?: typeof fetch;
};

/** Send one lead per selected model. `submissionIds` is what a caller that already started a
 * send keeps: without it every model gets a fresh key, exactly like the model page does. */
export async function submitBrandLeads(
  input: BrandLeadBatchInput & { targets: readonly BrandLeadTarget[]; submissionIds?: readonly string[] },
): Promise<BrandLeadBatch> {
  const { targets, values, consentVersion, fetchImpl } = input;
  return sendBrandLeadBatch(
    targets.map((target, index) => ({
      eventModelId: target.eventModelId,
      kind: target.kind,
      submissionId: input.submissionIds?.[index] ?? fairNewSubmissionId(),
    })),
    values,
    consentVersion,
    fetchImpl,
  );
}

/** "Pošalji ponovo" for the rows that failed: only the models in `failed`, with the
 * submissionId they already have — re-sending a key that finished answers `duplicate: true`
 * instead of creating a second lead (lead-form-model: retrying with the same key is safe). */
export async function retryBrandLeads(
  input: BrandLeadBatchInput & { failed: readonly BrandLeadReceipt[] },
): Promise<BrandLeadBatch> {
  const { failed, values, consentVersion, fetchImpl } = input;
  return sendBrandLeadBatch(
    failed.map((receipt) => ({
      eventModelId: receipt.eventModelId,
      kind: receipt.kind,
      submissionId: receipt.submissionId,
    })),
    values,
    consentVersion,
    fetchImpl,
  );
}

async function sendBrandLeadBatch(
  calls: readonly { eventModelId: string; kind: FairLeadSheetKind; submissionId: string }[],
  values: FairLeadFormValues,
  consentVersion: number,
  fetchImpl?: typeof fetch,
): Promise<BrandLeadBatch> {
  const receipts: BrandLeadReceipt[] = [];
  // One after another, never in flight together: this route is rate-limited 60 submissions per
  // minute per IP (lib/fair-ops.ts), so a parallel burst on a slow day answers 429.
  for (const call of calls) {
    const outcome = await sendFairLead(
      fairLeadRequestBody({
        eventModelId: call.eventModelId,
        kind: fairLeadApiKind(call.kind),
        submissionId: call.submissionId,
        values,
        consentVersion,
      }),
      values,
      fetchImpl,
    );
    receipts.push({ eventModelId: call.eventModelId, kind: call.kind, submissionId: call.submissionId, outcome });
  }
  return {
    receipts,
    sentIds: receipts.filter((receipt) => receipt.outcome.kind === "success").map((receipt) => receipt.eventModelId),
    failed: receipts.filter((receipt) => receipt.outcome.kind !== "success"),
  };
}
