"use client";

import { useRef, useState } from "react";
import {
  FAIR_LEAD_FINANCINGS,
  FAIR_LEAD_PURCHASE_TIMINGS,
  type FairErrorCode,
  type FairLeadFinancing,
  type FairLeadFormView,
  type FairLeadPurchaseTiming,
  type FairLeadSubmitResult,
} from "@/lib/fair-contract";
import { EMPTY_CONTACT_DRAFT, contactFormState, type ContactDraft } from "@/lib/fair-client/contact-form";
import { browserContactStorage, saveContact } from "@/lib/fair-client/contact-store";
import { newFairSubmissionId, postFair } from "@/lib/fair-client/fair-api";
import { fairErrorText, isFairUnavailableCode } from "@/lib/fair-client/fair-errors";
import { fairHaptic } from "@/lib/fair-client/haptics";
import { fairLeadSentText } from "@/lib/fair-client/lead-result";
import { fmt } from "@/lib/i18n";
import { ContactBlock } from "./contact-block";
import { FairSelect } from "./fair-select";
import { FairSheet } from "./fair-sheet";
import { useFairModelInteractions } from "./model-interactions";

// `Zainteresovan sam` (Starter+) and `Probna vožnja` (Advanced), MASTER §8:
// name + contact by the exhibitor's server rule, one Prihvatam/Odbijam
// consent naming ScanMe and the exhibitor, no date or slot choice. Success
// is shown only after the gateway answered OK.

export type LeadSheetKind = "interest" | "testDrive";

export function LeadSheet({
  kind,
  form,
  onRequestClose,
}: {
  kind: LeadSheetKind;
  form: FairLeadFormView | undefined;
  onRequestClose: (afterClose?: () => void) => void;
}) {
  const { dict, model, showToast } = useFairModelInteractions();
  const open = form?.state === "open" ? form : null;
  const [draft, setDraft] = useState<ContactDraft>(EMPTY_CONTACT_DRAFT);
  const [status, setStatus] = useState<"idle" | "sending" | "unavailable" | "error">(open ? "idle" : "unavailable");
  const [errorCode, setErrorCode] = useState<FairErrorCode | null>(null);
  const submissionId = useRef<string | null>(null);
  // 30 Oct 2026: model selector (defaults to the scanned model) and Nikom's optional answers.
  const [selectedModelId, setSelectedModelId] = useState(model.id);
  const [purchaseTiming, setPurchaseTiming] = useState<FairLeadPurchaseTiming | null>(null);
  const [financing, setFinancing] = useState<FairLeadFinancing | null>(null);
  const contact = open ? contactFormState(draft, open.contactRequirement) : null;
  const titleId = `fair-lead-${kind}-title`;
  const requirementText = open
    ? {
        one_of: dict.leadRequirementOneOf,
        email: dict.leadRequirementEmail,
        phone: dict.leadRequirementPhone,
        both: dict.leadRequirementBoth,
      }[open.contactRequirement]
    : "";

  async function send() {
    if (!open || !contact?.ok || !contact.payload || status === "sending") return;
    submissionId.current ??= newFairSubmissionId();
    setStatus("sending");
    setErrorCode(null);
    const result = await postFair<FairLeadSubmitResult>("/api/fair/lead", {
      eventModelId: model.id,
      kind: kind === "testDrive" ? "test_drive" : "interest",
      submissionId: submissionId.current,
      ...contact.payload,
      consentAccepted: true,
      consentVersion: open.consent.version,
      ...(open.modelChoices && selectedModelId !== model.id ? { selectedModelId } : {}),
      ...(open.extraFields && purchaseTiming ? { purchaseTiming } : {}),
      ...(open.extraFields && financing ? { financing } : {}),
    });
    if (!result.ok) {
      setErrorCode(result.code);
      setStatus(isFairUnavailableCode(result.code) ? "unavailable" : "error");
      return;
    }
    if (draft.remember) {
      saveContact(browserContactStorage(), {
        name: contact.payload.contactName,
        email: contact.payload.email,
        phone: contact.payload.phone,
      });
    }
    fairHaptic([20, 40, 40]);
    const text = fairLeadSentText(kind, result.value, dict, model.brandName);
    onRequestClose(() => showToast(text));
  }

  const unavailable = status === "unavailable" || !open;

  return (
    <FairSheet
      variant="full"
      titleId={titleId}
      title={kind === "testDrive" ? dict.testDriveSheetTitle : dict.interestSheetTitle}
      subtitle={`${model.brandName} ${model.displayName}`}
      mark={model.brandName.slice(0, 1)}
      closable={status !== "sending"}
      closeLabel={dict.closeSheet}
      onRequestClose={() => onRequestClose()}
      footer={
        unavailable ? (
          <button type="button" className="fair-sheet__secondary" onClick={() => onRequestClose()}>
            {dict.closeSheet}
          </button>
        ) : (
          <div className="fair-survey-send">
            {status === "error" && errorCode ? (
              <p className="fair-inline-error" role="alert">
                {fairErrorText(errorCode, dict)}
              </p>
            ) : null}
            <button
              type="button"
              className="fair-sheet__primary"
              disabled={!contact?.ok || status === "sending"}
              aria-busy={status === "sending" || undefined}
              onClick={() => void send()}
            >
              {status === "sending" ? dict.leadSending : kind === "testDrive" ? dict.sendTestDrive : dict.sendInterest}
            </button>
          </div>
        )
      }
    >
      <div className="fair-lead">
        {unavailable || !open ? (
          <div className="fair-lead__unavailable" role="status">
            <h3>{dict.leadUnavailableTitle}</h3>
            <p>{dict.leadUnavailableBody}</p>
          </div>
        ) : (
          <>
            <h3>{kind === "testDrive" ? dict.testDriveHeading : fmt(dict.interestHeading, { brand: model.brandName })}</h3>
            <p className="fair-survey-step__lead">
              {kind === "testDrive" ? dict.testDriveBody : fmt(dict.interestBody, { brand: model.brandName })}{" "}
              {requirementText}
              {open.preferredContact ? (
                <> {open.preferredContact === "email" ? dict.leadPreferredEmail : dict.leadPreferredPhone}</>
              ) : null}
            </p>
            {open.modelChoices ? (
              <FairSelect
                label={dict.leadModelLabel}
                placeholder={dict.leadChoose}
                options={open.modelChoices.map((choice) => ({
                  id: choice.id,
                  label: choice.displayName.startsWith(`${choice.brandName} `) ? choice.displayName.slice(choice.brandName.length + 1) : choice.displayName,
                  detail: choice.brandName,
                }))}
                value={selectedModelId}
                onChange={setSelectedModelId}
              />
            ) : null}
            {open.extraFields ? (
              <>
                <FairSelect
                  label={dict.leadPurchaseTimingLabel}
                  placeholder={dict.leadOptionalChoose}
                  options={FAIR_LEAD_PURCHASE_TIMINGS.map((id) => ({ id, label: dict.leadPurchaseTimings[id] }))}
                  value={purchaseTiming}
                  onChange={(id) => setPurchaseTiming(id as FairLeadPurchaseTiming)}
                />
                <FairSelect
                  label={dict.leadFinancingLabel}
                  placeholder={dict.leadOptionalChoose}
                  options={FAIR_LEAD_FINANCINGS.map((id) => ({ id, label: dict.leadFinancings[id] }))}
                  value={financing}
                  onChange={(id) => setFinancing(id as FairLeadFinancing)}
                />
              </>
            ) : null}
            <ContactBlock
              idPrefix={`fair-lead-${kind}`}
              requirement={open.contactRequirement}
              consentText={open.consent.text}
              draft={draft}
              onChange={setDraft}
              dict={dict}
            />
          </>
        )}
      </div>
    </FairSheet>
  );
}
