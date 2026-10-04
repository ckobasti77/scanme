"use client";

import { ConvexError } from "convex/values";
import { useMutation } from "convex/react";
import { Check, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { prelaunchSr as dict } from "@/lib/i18n/sr/prelaunch";
import styles from "./prelaunch-landing.module.css";

type FormValues = {
  contactName: string;
  businessName: string;
  businessType: string;
  city: string;
  phone: string;
  email: string;
  interests: string[];
  message: string;
  website: string;
};

type FieldName = keyof FormValues;
type FieldErrors = Partial<Record<FieldName, string>>;

const initialValues: FormValues = {
  contactName: "",
  businessName: "",
  businessType: "",
  city: "",
  phone: "",
  email: "",
  interests: [],
  message: "",
  website: "",
};

function validate(values: FormValues): FieldErrors {
  const errors: FieldErrors = {};
  if (values.contactName.trim().length < 2) errors.contactName = dict.lead.validation.name;
  if (values.businessName.trim().length < 2) errors.businessName = dict.lead.validation.business;
  if (!values.businessType) errors.businessType = dict.lead.validation.businessType;
  if (values.interests.length === 0) errors.interests = dict.lead.validation.interest;

  const email = values.email.trim();
  const phone = values.phone.trim();
  if (!email && !phone) {
    errors.phone = dict.lead.validation.contactPhone;
    errors.email = dict.lead.validation.contactEmail;
  } else {
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = dict.lead.validation.email;
    if (phone && phone.replace(/\D/g, "").length < 7) errors.phone = dict.lead.validation.phone;
  }
  return errors;
}

export function PrelaunchInterestForm() {
  const createLead = useMutation(api.leads.create);
  const [values, setValues] = useState<FormValues>(initialValues);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [serverError, setServerError] = useState("");
  const formStartedAt = useRef(0);
  const submissionId = useRef<string | null>(null);

  useEffect(() => {
    formStartedAt.current = Date.now();
  }, []);

  function update(field: Exclude<FieldName, "interests">, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function toggleInterest(interest: string) {
    setValues((current) => ({
      ...current,
      interests: current.interests.includes(interest)
        ? current.interests.filter((item) => item !== interest)
        : [...current.interests, interest],
    }));
    if (errors.interests) setErrors((current) => ({ ...current, interests: undefined }));
  }

  function validateOnBlur(field: Exclude<FieldName, "interests">) {
    const next = validate(values);
    if (field === "email" || field === "phone") {
      setErrors((current) => ({ ...current, email: next.email, phone: next.phone }));
      return;
    }
    setErrors((current) => ({ ...current, [field]: next[field] }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "pending") return;

    const nextErrors = validate(values);
    setErrors(nextErrors);
    const firstInvalid = Object.keys(nextErrors)[0] as FieldName | undefined;
    if (firstInvalid) {
      document.getElementById(firstInvalid)?.focus();
      return;
    }

    setStatus("pending");
    setServerError("");
    submissionId.current ??= crypto.randomUUID();
    const structuredMessage = [
      `Prelaunch interesovanje: ${values.interests.join(", ")}`,
      values.message.trim() ? `Poruka: ${values.message.trim()}` : "",
    ].filter(Boolean).join("\n\n");

    try {
      const request = createLead({
        contactName: values.contactName,
        businessName: values.businessName,
        businessType: values.businessType,
        ...(values.city.trim() ? { city: values.city } : {}),
        ...(values.email.trim() ? { email: values.email } : {}),
        ...(values.phone.trim() ? { phone: values.phone } : {}),
        interest: "not_sure",
        message: structuredMessage,
        submissionId: submissionId.current,
        formStartedAt: formStartedAt.current,
        website: values.website,
      });
      const timeout = new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error(dict.lead.genericError)), 8_000);
      });
      await Promise.race([request, timeout]);
      setStatus("success");
    } catch (error) {
      const message =
        error instanceof ConvexError && typeof error.data === "string"
          ? error.data
          : error instanceof Error
            ? error.message.replace(/^.*?Uncaught Error:\s*/, "")
            : dict.lead.genericError;
      setServerError(`${message} ${dict.lead.connectionError}`);
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className={styles.formSuccess} aria-live="polite">
        <Check aria-hidden="true" className="size-10 text-accent-readable" strokeWidth={1.5} />
        <div>
          <h3>{dict.lead.successTitle}</h3>
          <p>{dict.lead.successBody}</p>
        </div>
      </div>
    );
  }

  const errorFor = (field: FieldName) => errors[field] ? (
    <p id={`${field}-error`} className="text-sm leading-5 text-destructive" role="alert">{errors[field]}</p>
  ) : null;

  return (
    <form noValidate onSubmit={handleSubmit} className={styles.interestForm} aria-label={dict.lead.formAria} data-reveal="off">
      {status === "error" ? <div className={styles.formError} role="alert">{serverError}</div> : null}

      <div className={styles.twoColumns}>
        <div className="form-field">
          <Label htmlFor="contactName">{dict.lead.name}</Label>
          <Input id="contactName" name="contactName" autoComplete="name" value={values.contactName} onChange={(event) => update("contactName", event.target.value)} onBlur={() => validateOnBlur("contactName")} aria-invalid={Boolean(errors.contactName)} aria-describedby={errors.contactName ? "contactName-error" : undefined} className="form-control" />
          {errorFor("contactName")}
        </div>
        <div className="form-field">
          <Label htmlFor="businessName">{dict.lead.business}</Label>
          <Input id="businessName" name="businessName" autoComplete="organization" value={values.businessName} onChange={(event) => update("businessName", event.target.value)} onBlur={() => validateOnBlur("businessName")} aria-invalid={Boolean(errors.businessName)} aria-describedby={errors.businessName ? "businessName-error" : undefined} className="form-control" />
          {errorFor("businessName")}
        </div>
      </div>

      <div className={styles.twoColumns}>
        <div className="form-field">
          <Label htmlFor="businessType">{dict.lead.businessType}</Label>
          <select id="businessType" name="businessType" value={values.businessType} onChange={(event) => update("businessType", event.target.value)} onBlur={() => validateOnBlur("businessType")} aria-invalid={Boolean(errors.businessType)} aria-describedby={errors.businessType ? "businessType-error" : undefined} className="form-control h-12 w-full appearance-none px-3 text-base">
            <option value="">{dict.lead.businessTypePlaceholder}</option>
            {dict.lead.businessTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          {errorFor("businessType")}
        </div>
        <div className="form-field">
          <Label htmlFor="city">{dict.lead.city}</Label>
          <Input id="city" name="city" autoComplete="address-level2" value={values.city} onChange={(event) => update("city", event.target.value)} className="form-control" />
        </div>
      </div>

      <fieldset className="grid gap-3">
        <legend className="text-sm font-medium">{dict.lead.contactLegend}</legend>
        <p className="text-sm leading-5 text-foreground/56">{dict.lead.contactHint}</p>
        <div className={styles.twoColumns}>
          <div className="form-field">
            <Label htmlFor="phone">{dict.lead.phone}</Label>
            <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" value={values.phone} onChange={(event) => update("phone", event.target.value)} onBlur={() => validateOnBlur("phone")} aria-invalid={Boolean(errors.phone)} aria-describedby={errors.phone ? "phone-error" : undefined} className="form-control" />
            {errorFor("phone")}
          </div>
          <div className="form-field">
            <Label htmlFor="email">{dict.lead.email}</Label>
            <Input id="email" name="email" type="email" inputMode="email" autoComplete="email" value={values.email} onChange={(event) => update("email", event.target.value)} onBlur={() => validateOnBlur("email")} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "email-error" : undefined} className="form-control" />
            {errorFor("email")}
          </div>
        </div>
      </fieldset>

      <fieldset id="interests" className="grid gap-3" tabIndex={-1} aria-describedby={errors.interests ? "interests-error" : undefined}>
        <legend className="text-sm font-medium">{dict.lead.interestLegend}</legend>
        <div className={styles.interestOptions}>
          {dict.lead.interests.map((interest) => {
            const checked = values.interests.includes(interest);
            return (
              <label key={interest} className={styles.interestOption} data-checked={checked ? "true" : "false"}>
                <input type="checkbox" checked={checked} onChange={() => toggleInterest(interest)} />
                <span>{interest}</span>
              </label>
            );
          })}
        </div>
        {errorFor("interests")}
      </fieldset>

      <div className="form-field">
        <Label htmlFor="message">{dict.lead.message}</Label>
        <Textarea id="message" name="message" rows={4} maxLength={5000} placeholder={dict.lead.messagePlaceholder} value={values.message} onChange={(event) => update("message", event.target.value)} className="form-control min-h-28 resize-y" />
      </div>

      <div className="hidden" aria-hidden="true">
        <Label htmlFor="website">{dict.lead.website}</Label>
        <Input id="website" name="website" tabIndex={-1} autoComplete="off" value={values.website} onChange={(event) => update("website", event.target.value)} />
      </div>

      <button type="submit" disabled={status === "pending"} className="button-primary focus-signal mt-2 w-full">
        {status === "pending" ? <><LoaderCircle aria-hidden="true" className="size-4 animate-spin" strokeWidth={1.75} />{dict.lead.submitting}</> : dict.lead.submit}
      </button>
    </form>
  );
}
