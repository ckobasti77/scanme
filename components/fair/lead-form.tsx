"use client";

import { Check } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import {
  FAIR_LEAD_EMAIL_MAX,
  FAIR_LEAD_NAME_MAX,
  FAIR_LEAD_PHONE_MAX,
  normalizeFairLeadEmail,
  type FairLeadSubmitInput,
} from "@/lib/fair-contract";
import { fmt, type FairModelDict } from "@/lib/i18n";
import {
  FAIR_EMPTY_LEAD_DRAFT,
  fairLeadFieldPlan,
  fairLeadFieldProblem,
  fairLeadRequestBody,
  fairNewSubmissionId,
  sendFairLead,
  validateFairLeadForm,
  type FairLeadDraft,
  type FairLeadFieldError,
  type FairLeadFieldErrors,
  type FairLeadFieldName,
  type FairLeadFormValues,
  type FairLeadOutcome,
  type FairLeadSheetKind,
} from "./lead-form-model";
import type { FairOpenLeadForm } from "./model-view";
import styles from "./lead-form.module.css";

// Sajam 2026 N6 — the real `Zainteresovan sam` / `Probna vožnja` form. The
// draft (values + consent choice) and the status live in the parent, so a
// closed and reopened sheet keeps what was typed — in React state only, never
// in browser storage; after success the contact is dropped. One submissionId
// per opening of the form, reused by every retry of that opening.

export type FairLeadStatus =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; duplicate: boolean; confirmationTo: string | null }
  | { kind: "error"; outcome: Exclude<FairLeadOutcome, { kind: "success" }> };

export type FairLeadSender = (body: FairLeadSubmitInput, values: FairLeadFormValues) => Promise<FairLeadOutcome>;

function fieldMessage(field: FairLeadFieldName, error: FairLeadFieldError, dict: FairModelDict): string {
  if (field === "contactName") {
    switch (error) {
      case "too_long":
        return dict.leadErrorNameTooLong;
      case "link":
        return dict.leadErrorNameLink;
      case "invisible":
        return dict.leadErrorNameInvisible;
      case "characters":
      case "format":
        return dict.leadErrorNameCharacters;
      default:
        return dict.leadErrorNameEmpty;
    }
  }
  if (error === "one_of") return dict.leadErrorContactOneOf;
  if (field === "email") return error === "required" ? dict.leadErrorEmailRequired : dict.leadErrorEmailFormat;
  return error === "required" ? dict.leadErrorPhoneRequired : dict.leadErrorPhoneFormat;
}

function ruleText(form: FairOpenLeadForm, dict: FairModelDict): string {
  const rule =
    form.contactRequirement === "email" ? dict.leadContactEmail
    : form.contactRequirement === "phone" ? dict.leadContactPhone
    : form.contactRequirement === "both" ? dict.leadContactBoth
    : dict.leadContactOneOf;
  const preferred = form.preferredContact === "email" ? dict.leadPreferredEmail : form.preferredContact === "phone" ? dict.leadPreferredPhone : null;
  return preferred ? `${rule} ${preferred}` : rule;
}

export function FairLeadForm({
  kind,
  form,
  eventModelId,
  modelName,
  exhibitorName,
  dict,
  draft,
  onDraftChange,
  status,
  onStatusChange,
  onClose,
  initialFieldErrors,
  send = sendFairLead,
}: {
  kind: FairLeadSheetKind;
  form: FairOpenLeadForm;
  eventModelId: string;
  modelName: string;
  exhibitorName: string;
  dict: FairModelDict;
  draft: FairLeadDraft;
  onDraftChange: (draft: FairLeadDraft) => void;
  status: FairLeadStatus;
  onStatusChange: (status: FairLeadStatus) => void;
  onClose: () => void;
  /** DEV preview only: render with these field errors. */
  initialFieldErrors?: FairLeadFieldErrors;
  /** DEV preview only: a stand-in for POST /api/fair/lead. */
  send?: FairLeadSender;
}) {
  const id = useId();
  const [submissionId, setSubmissionId] = useState(() => fairNewSubmissionId());
  const [fieldErrors, setFieldErrors] = useState<FairLeadFieldErrors>(initialFieldErrors ?? {});
  const busyRef = useRef(false);
  const successRef = useRef<HTMLHeadingElement>(null);
  const plan = fairLeadFieldPlan(form.contactRequirement, form.preferredContact);
  const { values, consent } = draft;
  const busy = status.kind === "submitting";
  const fieldId = (field: FairLeadFieldName) => `${id}-${field}`;

  useEffect(() => {
    if (status.kind === "success") successRef.current?.focus({ preventScroll: true });
  }, [status.kind]);

  function focusField(field: FairLeadFieldName) {
    document.getElementById(fieldId(field))?.focus();
  }

  function setValue(field: FairLeadFieldName, value: string) {
    onDraftChange({ ...draft, values: { ...values, [field]: value } });
    if (fieldErrors[field]) setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  function checkOnBlur(field: FairLeadFieldName) {
    const raw = values[field];
    if (!raw.trim() && field !== "contactName") return;
    if (field === "contactName" && !raw) return;
    const problem = fairLeadFieldProblem(field, raw);
    setFieldErrors((current) => ({ ...current, [field]: problem ?? undefined }));
  }

  async function submit() {
    if (busyRef.current || consent !== "accept") return;
    const checked = validateFairLeadForm(values, form.contactRequirement);
    setFieldErrors(checked.errors);
    if (checked.firstInvalid) {
      onStatusChange({ kind: "idle" });
      focusField(checked.firstInvalid);
      return;
    }
    busyRef.current = true;
    onStatusChange({ kind: "submitting" });
    const body = fairLeadRequestBody({ eventModelId, kind, submissionId, values, consentVersion: form.consent.version });
    const outcome = await send(body, values);
    busyRef.current = false;
    if (outcome.kind === "success") {
      const confirmationTo = outcome.confirmationEmail && body.email ? (normalizeFairLeadEmail(body.email) ?? body.email) : null;
      onDraftChange(FAIR_EMPTY_LEAD_DRAFT);
      onStatusChange({ kind: "success", duplicate: outcome.duplicate, confirmationTo });
      return;
    }
    if (outcome.kind === "field") {
      setFieldErrors((current) => ({ ...current, [outcome.field]: outcome.error }));
      focusField(outcome.field);
    }
    if (outcome.kind === "conflict") setSubmissionId(fairNewSubmissionId());
    onStatusChange({ kind: "error", outcome });
  }

  if (status.kind === "success") {
    const testDrive = kind === "testDrive";
    return (
      <div className={styles.success} role="status">
        <span className={styles.successMark} aria-hidden="true">
          <Check />
        </span>
        <h3 ref={successRef} tabIndex={-1}>
          {status.duplicate ? dict.leadDuplicateTitle : dict.leadSuccessTitle}
        </h3>
        <p>
          {status.duplicate
            ? fmt(testDrive ? dict.leadDuplicateTestDrive : dict.leadDuplicateInterest, { exhibitor: exhibitorName })
            : fmt(dict.leadSuccessBody, { exhibitor: exhibitorName })}
        </p>
        {testDrive ? <p className={styles.note}>{dict.leadSuccessTestDrive}</p> : null}
        {status.confirmationTo ? <p className={styles.note}>{fmt(dict.leadSuccessConfirmation, { email: status.confirmationTo })}</p> : null}
        <button className="fair-sheet__primary" type="button" onClick={onClose}>
          {dict.closeSheet}
        </button>
      </div>
    );
  }

  const error = status.kind === "error" ? status.outcome : null;
  const describedBy = (field: FairLeadFieldName, hint?: string) =>
    [hint, fieldErrors[field] ? `${fieldId(field)}-error` : null].filter(Boolean).join(" ") || undefined;
  const fieldError = (field: FairLeadFieldName) =>
    fieldErrors[field] ? (
      <p id={`${fieldId(field)}-error`} className={styles.fieldError}>
        {fieldMessage(field, fieldErrors[field]!, dict)}
      </p>
    ) : null;
  const optional = (required: boolean) => (!required && !plan.oneOf ? <span className={styles.optional}>{dict.leadOptional}</span> : null);

  return (
    <form
      className={`fair-sheet__form ${styles.form}`}
      noValidate
      aria-busy={busy}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <p className={styles.intro}>
        {fmt(kind === "testDrive" ? dict.leadIntroTestDrive : dict.leadIntroInterest, { model: modelName, exhibitor: exhibitorName })}
      </p>

      <div className={styles.field}>
        <label className={styles.label} htmlFor={fieldId("contactName")}>
          <span>{dict.fullNameLabel}</span>
        </label>
        <input
          id={fieldId("contactName")}
          name="name"
          data-autofocus=""
          autoComplete="name"
          autoCapitalize="words"
          enterKeyHint="next"
          maxLength={FAIR_LEAD_NAME_MAX}
          required
          value={values.contactName}
          aria-invalid={fieldErrors.contactName ? true : undefined}
          aria-describedby={describedBy("contactName")}
          onChange={(event) => setValue("contactName", event.target.value)}
          onBlur={() => checkOnBlur("contactName")}
        />
        {fieldError("contactName")}
      </div>

      <p className={styles.rule} id={`${id}-rule`}>
        {ruleText(form, dict)}
      </p>

      <div className={styles.field}>
        <label className={styles.label} htmlFor={fieldId("email")}>
          <span>{dict.emailLabel}</span>
          {optional(plan.emailRequired)}
        </label>
        <input
          id={fieldId("email")}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          maxLength={FAIR_LEAD_EMAIL_MAX}
          required={plan.emailRequired}
          value={values.email}
          aria-invalid={fieldErrors.email ? true : undefined}
          aria-describedby={describedBy("email", `${fieldId("email")}-hint ${id}-rule`)}
          onChange={(event) => setValue("email", event.target.value)}
          onBlur={() => checkOnBlur("email")}
        />
        <p id={`${fieldId("email")}-hint`} className={styles.hint}>
          {dict.leadEmailHint}
        </p>
        {fieldError("email")}
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor={fieldId("phone")}>
          <span>{dict.phoneLabel}</span>
          {optional(plan.phoneRequired)}
        </label>
        <input
          id={fieldId("phone")}
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          enterKeyHint="done"
          maxLength={FAIR_LEAD_PHONE_MAX}
          placeholder={dict.leadPhonePlaceholder}
          required={plan.phoneRequired}
          value={values.phone}
          aria-invalid={fieldErrors.phone ? true : undefined}
          aria-describedby={describedBy("phone", `${fieldId("phone")}-hint`)}
          onChange={(event) => setValue("phone", event.target.value)}
          onBlur={() => checkOnBlur("phone")}
        />
        <p id={`${fieldId("phone")}-hint`} className={styles.hint}>
          {dict.leadPhoneHint}
        </p>
        {fieldError("phone")}
      </div>

      <fieldset className={styles.consent}>
        <legend>{dict.leadConsentLegend}</legend>
        <p id={`${id}-consent`} className={styles.consentText}>
          {form.consent.text}
        </p>
        <div className={styles.choices}>
          {(["accept", "decline"] as const).map((choice) => (
            <label key={choice} className={styles.choice} data-choice={choice} data-checked={consent === choice}>
              <input
                type="radio"
                name={`${id}-consent-choice`}
                value={choice}
                checked={consent === choice}
                aria-describedby={`${id}-consent`}
                onChange={() => onDraftChange({ ...draft, consent: choice })}
              />
              <span>{choice === "accept" ? dict.leadConsentAccept : dict.leadConsentDecline}</span>
            </label>
          ))}
        </div>
        {consent === "decline" ? (
          <p className={styles.declined} role="status">
            {dict.leadConsentDeclined}
          </p>
        ) : null}
      </fieldset>

      {error ? (
        <div className={styles.alert} role="alert">
          {error.kind === "rate_limited" ? <p>{fmt(dict.leadErrorRateLimited, { seconds: error.retryAfterSeconds })}</p> : null}
          {error.kind === "field" ? <p>{dict.leadErrorFields}</p> : null}
          {error.kind === "closed" ? <p>{dict.leadErrorClosed}</p> : null}
          {error.kind === "consent_changed" ? (
            <>
              <p>{dict.leadErrorConsentChanged}</p>
              <button className={styles.secondary} type="button" onClick={() => window.location.reload()}>
                {dict.leadReload}
              </button>
            </>
          ) : null}
          {error.kind === "failed" || error.kind === "conflict" ? <p>{dict.leadErrorFailed}</p> : null}
        </div>
      ) : null}

      {/* While sending the button keeps its look (aria-busy + aria-disabled); busyRef blocks a second send. */}
      <button
        className={`fair-sheet__primary ${styles.submit}`}
        type="submit"
        disabled={consent !== "accept"}
        aria-disabled={busy || undefined}
        aria-busy={busy}
        aria-describedby={consent === "accept" ? undefined : `${id}-submit-hint`}
      >
        {busy ? (
          <span className={styles.busy}>
            <span className={styles.spinner} aria-hidden="true" />
            {dict.leadSubmitting}
          </span>
        ) : error?.kind === "failed" || error?.kind === "conflict" ? (
          dict.leadRetry
        ) : kind === "testDrive" ? (
          dict.sendTestDrive
        ) : (
          dict.sendInterest
        )}
      </button>
      {consent === "accept" ? null : (
        <p id={`${id}-submit-hint`} className={styles.submitHint}>
          {dict.leadConsentNeeded}
        </p>
      )}
    </form>
  );
}
