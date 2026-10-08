"use client";

import { useRef, useState } from "react";
import type { FairContactRequirement } from "@/lib/fair-contract";
import {
  contactFields,
  contactFormState,
  draftFromSavedContact,
  type ContactDraft,
  type ContactField,
  type ContactHint,
} from "@/lib/fair-client/contact-form";
import {
  browserContactStorage,
  forgetContact,
  readSavedContact,
  type FairSavedContact,
} from "@/lib/fair-client/contact-store";
import { fairHaptic } from "@/lib/fair-client/haptics";
import type { FairModelDict } from "@/lib/i18n";

// Shared contact block: both lead sheets (required) and the survey's final
// step (optional). The consent text comes from the server and names ScanMe
// and the concrete exhibitor; it is answered every time and never stored.

const hintText = (hint: ContactHint, dict: FairModelDict) =>
  ({
    name: dict.hintName,
    contact: dict.hintContact,
    email: dict.hintEmail,
    phone: dict.hintPhone,
    consent: dict.hintConsent,
    declined: dict.hintDeclined,
  })[hint];

const fieldInput: Record<ContactField, { type: string; inputMode: "email" | "tel"; autoComplete: string }> = {
  contact: { type: "text", inputMode: "email", autoComplete: "email" },
  email: { type: "email", inputMode: "email", autoComplete: "email" },
  phone: { type: "tel", inputMode: "tel", autoComplete: "tel" },
};

export function ContactBlock({
  idPrefix,
  requirement,
  consentText,
  draft,
  onChange,
  dict,
}: {
  idPrefix: string;
  requirement: FairContactRequirement;
  consentText: string;
  draft: ContactDraft;
  onChange: (draft: ContactDraft) => void;
  dict: FairModelDict;
}) {
  const [saved, setSaved] = useState<FairSavedContact | null>(() => readSavedContact(browserContactStorage()));
  const [touched, setTouched] = useState(false);
  const acceptRef = useRef<HTMLButtonElement>(null);
  const state = contactFormState(draft, requirement);
  const hint = touched && !state.empty ? state.hint : null;
  const fieldLabel = (field: ContactField) =>
    field === "contact" ? dict.contactOneOfLabel : field === "email" ? dict.emailLabel : dict.phoneLabel;

  function setConsent(consent: boolean) {
    setTouched(true);
    fairHaptic(8);
    onChange({ ...draft, consent });
  }

  return (
    <div className="fair-contact">
      {saved ? (
        <div className="fair-contact__saved" role="group" aria-label={dict.savedContactAria}>
          <div>
            <b>{saved.name}</b>
            <span>{[saved.email, saved.phone].filter(Boolean).join(" · ")}</span>
          </div>
          <button
            type="button"
            className="fair-contact__use"
            onClick={() => {
              fairHaptic(10);
              onChange(draftFromSavedContact(saved, requirement, draft));
              acceptRef.current?.focus({ preventScroll: true });
            }}
          >
            {dict.savedContactUse}
          </button>
          <button
            type="button"
            className="fair-contact__forget"
            onClick={() => {
              forgetContact(browserContactStorage());
              setSaved(null);
              onChange({ ...draft, remember: false });
            }}
          >
            {dict.savedContactForget}
          </button>
        </div>
      ) : null}

      <label className="fair-field" htmlFor={`${idPrefix}-name`}>
        <span>{dict.fullNameLabel}</span>
        <input
          id={`${idPrefix}-name`}
          name="name"
          autoComplete="name"
          value={draft.name}
          aria-invalid={hint === "name" || undefined}
          onBlur={() => setTouched(true)}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
        />
      </label>

      {contactFields(requirement).map((field) => (
        <label key={field} className="fair-field" htmlFor={`${idPrefix}-${field}`}>
          <span>{fieldLabel(field)}</span>
          <input
            id={`${idPrefix}-${field}`}
            name={field}
            {...fieldInput[field]}
            value={draft[field]}
            aria-invalid={hint === field || undefined}
            onBlur={() => setTouched(true)}
            onChange={(event) => onChange({ ...draft, [field]: event.target.value })}
          />
        </label>
      ))}

      <div className="fair-consent">
        <p>{consentText}</p>
        <div className="fair-consent__choice" role="group" aria-label={dict.consentGroupAria}>
          <button
            ref={acceptRef}
            type="button"
            data-choice="accept"
            aria-pressed={draft.consent === true}
            onClick={() => setConsent(true)}
          >
            {dict.consentAccept}
          </button>
          <button
            type="button"
            data-choice="decline"
            aria-pressed={draft.consent === false}
            onClick={() => setConsent(false)}
          >
            {dict.consentDecline}
          </button>
        </div>
      </div>

      <label className="fair-contact__remember">
        <input
          type="checkbox"
          checked={draft.remember}
          onChange={(event) => onChange({ ...draft, remember: event.target.checked })}
        />
        <span>{dict.rememberContact}</span>
      </label>

      <p className="fair-contact__hint" aria-live="polite">
        {hint ? hintText(hint, dict) : ""}
      </p>
    </div>
  );
}
