"use client";

import { useRef, useState } from "react";
import { EMPTY_CONTACT_DRAFT, contactFormState, type ContactDraft, type ContactPayload } from "@/lib/fair-client/contact-form";
import { browserContactStorage, saveContact } from "@/lib/fair-client/contact-store";
import { fairHaptic } from "@/lib/fair-client/haptics";
import type { FairLeadFormView } from "@/lib/fair-contract";
import type { FairBrandDict } from "@/lib/i18n/types";
import type { FairBrandPageData, FairBrandPageModel } from "@/lib/fair-server/brand-page";
import { getDict, srPluralCategory } from "@/lib/i18n";
import { ContactBlock } from "../contact-block";
import { FairSheet } from "../fair-sheet";
import { FairBrandModelPicker } from "./brand-model-picker";
import { submitBrandLeads } from "./submit-brand-leads";

// Brand-page lead sheet (card 05d): one sheet for the whole brand, several models
// per send. Only models whose form for this kind is `open` can be picked; the
// contact rule and the consent sentence come from the FIRST open model (one
// exhibitor, one rule), while each model sends its own `consent.version`
// (submit-brand-leads.ts, 05b). ContactBlock keeps the fair-model dictionary —
// the shared contact copy — and the unavailable block repeats the model page's.

type OpenLeadForm = Extract<FairLeadFormView, { state: "open" }>;

export function FairBrandLeadSheet({ kind, brandName, models, leadForms, preselectedIds, onClose, onSent, dict }: {
  kind: "testDrive" | "interest";
  brandName: string;
  models: FairBrandPageModel[];
  leadForms: FairBrandPageData["leadForms"];
  preselectedIds: string[];
  /** The page's fair-brand dictionary, taken as a prop the way the fair-garage components do. */
  dict: FairBrandDict;
  onClose: () => void;
  onSent: (sent: { ids: string[]; contact: ContactPayload; email?: string }) => void;
}) {
  const modelDict = getDict("fair-model");

  // Pickable models in the brand's own order: only open forms for this kind.
  const available: { model: FairBrandPageModel; form: OpenLeadForm }[] = [];
  for (const model of models) {
    const form = kind === "testDrive" ? leadForms[model.id]?.testDrive : leadForms[model.id]?.interest;
    if (form && form.state === "open") available.push({ model, form });
  }

  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    preselectedIds.filter((id) => available.some((entry) => entry.model.id === id)),
  );
  const [draft, setDraft] = useState<ContactDraft>(EMPTY_CONTACT_DRAFT);
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");
  // The same object goes to submitBrandLeads on every try: a model that failed
  // keeps its submissionId, so a retry sends one lead, not two (05b's comment).
  const submissionIds = useRef<Record<string, string>>({});

  const open = available[0]?.form;
  const contact = open
    ? contactFormState(draft, open.contactRequirement, open.collectOptionalEmail)
    : null;
  const titleId = `fair-brand-${kind}-title`;
  const unavailable = !open;

  async function send() {
    if (!open || !contact?.ok || !contact.payload || status === "sending") return;
    const payload = contact.payload;
    const ids = selectedIds;
    setStatus("sending");
    const consentVersionById: Record<string, number> = {};
    for (const entry of available) {
      if (ids.includes(entry.model.id)) consentVersionById[entry.model.id] = entry.form.consent.version;
    }
    const results = await submitBrandLeads({
      kind,
      eventModelIds: ids,
      contact: payload,
      consentVersionById,
      submissionIds: submissionIds.current,
      dict, // page dict through, so every brand file takes dict (checker section 4)
    });
    const failed = results.filter((result) => !result.ok);
    if (failed.length === 0) {
      if (draft.remember) {
        saveContact(browserContactStorage(), {
          name: payload.contactName,
          email: payload.email,
          phone: payload.phone,
        });
      }
      fairHaptic([20, 40, 40]);
      onSent({ ids, contact: payload, email: payload.email });
      return;
    }
    // The sheet stays open: only the failed models remain chosen, so the next
    // click re-sends exactly them (their submissionIds are still in the map).
    setSelectedIds(failed.map((result) => result.eventModelId));
    setStatus("error");
  }

  // The button keeps the mockup's fixed strings (sr/fair-brand.ts:120-125):
  // 1 -> submitOne, more -> submitFew/submitMany through the app's plural rule.
  const category = srPluralCategory(selectedIds.length);
  const submitText =
    status === "sending" ? dict.submitting
      : category === "one" ? dict.submitOne
      : category === "few" ? dict.submitFew
      : dict.submitMany;

  return (
    <FairSheet
      variant="full"
      titleId={titleId}
      title={kind === "testDrive" ? dict.sheetTitle : modelDict.interestSheetTitle}
      subtitle={brandName}
      mark={brandName.slice(0, 1)}
      closable={status !== "sending"}
      closeLabel={dict.closeSheet}
      onRequestClose={onClose}
      footer={
        unavailable ? (
          <button type="button" className="fair-sheet__secondary" onClick={onClose}>
            {dict.closeSheet}
          </button>
        ) : (
          <div className="fair-survey-send">
            {status === "error" ? (
              <p className="fair-inline-error" role="alert">
                {dict.errorSend}
              </p>
            ) : null}
            <button
              type="button"
              className="fair-sheet__primary"
              disabled={selectedIds.length === 0 || !contact?.ok || status === "sending"}
              aria-busy={status === "sending" || undefined}
              onClick={() => void send()}
            >
              {submitText}
            </button>
          </div>
        )
      }
    >
      <div className="fair-lead">
        {unavailable || !open ? (
          <div className="fair-lead__unavailable" role="status">
            <h3>{modelDict.leadUnavailableTitle}</h3>
            <p>{modelDict.leadUnavailableBody}</p>
          </div>
        ) : (
          <>
            <FairBrandModelPicker
              models={available.map((entry) => entry.model)}
              selectedIds={selectedIds}
              dict={dict}
              onToggle={(id) =>
                setSelectedIds((ids) =>
                  ids.includes(id) ? ids.filter((selected) => selected !== id) : [...ids, id],
                )
              }
              label={dict.sheetSelectModels}
              countText={dict.selectedCount(selectedIds.length)}
            />
            <ContactBlock
              idPrefix={titleId}
              requirement={open.contactRequirement}
              collectOptionalEmail={open.collectOptionalEmail}
              consentText={open.consent.text}
              draft={draft}
              onChange={setDraft}
              dict={modelDict}
            />
          </>
        )}
      </div>
    </FairSheet>
  );
}
