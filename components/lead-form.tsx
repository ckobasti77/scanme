"use client";

import { ConvexError } from "convex/values";
import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { Check, ChevronDown, LoaderCircle } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { readOfferLogoSession } from "@/lib/offer-logo-session";
import styles from "./lead-form.module.css";

type FormValues = {
  contactName: string;
  businessName: string;
  businessType: string;
  phone: string;
  email: string;
  city: string;
  interest: "review" | "page" | "venue" | "memories" | "loyalty" | "not_sure";
  message: string;
  website: string;
};

type FieldName = keyof FormValues;
type FieldErrors = Partial<Record<FieldName, string>>;

/**
 * Opšta ScanMe kontakt forma (javni landing): polja sa linijom ispod i
 * „Zanima me“ kao višestruki izbor (čipovi). Bez ovog propa forma je ista kao
 * u klasičnom #ponuda toku. Argumenti leads.create se ne menjaju (`interest`
 * je jedna vrednost): izbor koji sadrži ScanMe Review šalje "review", ostali
 * "not_sure", a kad izbor nije samo Review ili „Nisam siguran/na“, prvi red
 * poruke je „<interestLinePrefix> <usluga>, <usluga>“.
 */
export type LeadFormGeneralCopy = {
  formAria: string;
  cityLabel: string;
  interestHint: string;
  interestRequired: string;
  interestLinePrefix: string;
  services: ReadonlyArray<{
    value: string;
    label: string;
    interest: FormValues["interest"];
    tag?: string;
    messageLabel?: string;
  }>;
  submit: string;
  submitting: string;
  successTitle: string;
  successBody: string;
};

const initialValues: FormValues = {
  contactName: "",
  businessName: "",
  businessType: "",
  phone: "",
  email: "",
  city: "Beograd",
  interest: "review",
  message: "",
  website: "",
};

function validate(values: FormValues): FieldErrors {
  const errors: FieldErrors = {};
  if (values.contactName.trim().length < 2) errors.contactName = "Unesite ime i prezime.";
  if (values.businessName.trim().length < 2) errors.businessName = "Unesite naziv biznisa.";
  if (!values.businessType) errors.businessType = "Izaberite tip biznisa.";

  const email = values.email.trim();
  const phone = values.phone.trim();
  if (!email && !phone) {
    errors.phone = "Unesite telefon ili imejl.";
    errors.email = "Unesite imejl ili telefon.";
  } else {
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = "Unesite ispravnu imejl adresu.";
    }
    if (phone && phone.replace(/\D/g, "").length < 7) {
      errors.phone = "Unesite ispravan broj telefona.";
    }
  }
  return errors;
}

export function LeadForm({
  initialMessage = "",
  initialOfferSelection,
  initialLogoUploadId,
  generalCopy,
}: {
  initialMessage?: string;
  initialOfferSelection?: string;
  initialLogoUploadId?: string;
  generalCopy?: LeadFormGeneralCopy;
} = {}) {
  const createLead = useMutation(api.leads.create);
  // `initialMessage` je predlog rezimea iz toka ponude (server-side); prazan bez konteksta.
  // Kontrolisano polje — korisnik ga slobodno menja ili briše.
  const [values, setValues] = useState<FormValues>(() => ({
    ...initialValues,
    ...(generalCopy ? { city: "" } : {}),
    message: initialMessage,
  }));
  const [services, setServices] = useState<string[]>([]);
  const successHeadingRef = useRef<HTMLHeadingElement>(null);
  // Prvi red „Zanima me: <usluge>“ ulazi u isto ograničenje od 5000 znakova na serveru.
  const messageMaxLength = generalCopy
    ? 5000 -
      (generalCopy.interestLinePrefix.length +
        generalCopy.services.reduce((total, option) => total + (option.messageLabel ?? option.label).length + 2, 0) +
        3)
    : 5000;
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [serverError, setServerError] = useState("");
  const formStartedAt = useRef(0);
  const submissionId = useRef<string | null>(null);

  useEffect(() => {
    formStartedAt.current = Date.now();
  }, []);

  // Forma nestaje posle uspeha; fokus prelazi na potvrdu da je čitač ekrana pročita.
  useEffect(() => {
    if (status === "success" && generalCopy) successHeadingRef.current?.focus();
  }, [status, generalCopy]);

  const update = (field: FieldName, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    if (errors[field]) {
      setErrors((current) => ({ ...current, [field]: undefined }));
    }
  };

  // „Nisam siguran/na“ isključuje usluge i obrnuto; ostalo se pali i gasi.
  const toggleService = (value: string) => {
    setServices((current) => {
      if (current.includes(value)) return current.filter((item) => item !== value);
      if (value === "not_sure") return [value];
      return [...current.filter((item) => item !== "not_sure"), value];
    });
    if (errors.interest) setErrors((current) => ({ ...current, interest: undefined }));
  };

  const validateOnBlur = (field: FieldName) => {
    const next = validate(values);
    if (field === "email" || field === "phone") {
      setErrors((current) => ({
        ...current,
        email: next.email,
        phone: next.phone,
      }));
      return;
    }
    setErrors((current) => ({ ...current, [field]: next[field] }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status === "pending") return;

    const nextErrors = validate(values);
    if (generalCopy && services.length === 0) nextErrors.interest = generalCopy.interestRequired;
    setErrors(nextErrors);
    const firstInvalid = Object.keys(nextErrors)[0] as FieldName | undefined;
    if (firstInvalid) {
      document.getElementById(firstInvalid)?.focus();
      return;
    }

    setStatus("pending");
    setServerError("");
    submissionId.current ??= crypto.randomUUID();
    const chosen = generalCopy?.services.filter((option) => services.includes(option.value)) ?? [];
    const interest = generalCopy
      ? chosen.some((option) => option.interest === "review")
        ? "review"
        : "not_sure"
      : values.interest;
    // Usluge bez tačne `interest` vrednosti (ili više njih) idu u prvi red poruke.
    const listed = chosen.filter((option) => option.value !== "not_sure");
    const message = listed.some((option) => option.messageLabel)
      ? [
          `${generalCopy?.interestLinePrefix} ${listed.map((option) => option.messageLabel ?? option.label).join(", ")}`,
          values.message.trim(),
        ]
          .filter(Boolean)
          .join("\n\n")
      : values.message;

    try {
      const logoSessionToken = initialLogoUploadId ? readOfferLogoSession() : null;
      const request = createLead({
        contactName: values.contactName,
        businessName: values.businessName,
        businessType: values.businessType,
        ...(values.city.trim() ? { city: values.city } : {}),
        ...(values.email.trim() ? { email: values.email } : {}),
        ...(values.phone.trim() ? { phone: values.phone } : {}),
        interest,
        ...(message.trim() ? { message } : {}),
        ...(initialOfferSelection ? { offerSelection: initialOfferSelection } : {}),
        ...(initialLogoUploadId && logoSessionToken
          ? {
              logoUploadId: initialLogoUploadId as Id<"offerLogoUploads">,
              logoSessionToken,
            }
          : {}),
        submissionId: submissionId.current,
        formStartedAt: formStartedAt.current,
        website: values.website,
      });
      const timeout = new Promise<never>((_, reject) => {
        window.setTimeout(
          () => reject(new Error("Slanje traje duže nego što je očekivano.")),
          8_000,
        );
      });
      await Promise.race([request, timeout]);
      setStatus("success");
    } catch (error) {
      const message =
        error instanceof ConvexError && typeof error.data === "string"
          ? error.data
          : error instanceof Error
            ? error.message.replace(/^.*?Uncaught Error:\s*/, "")
            : "Zahtev trenutno nije moguće poslati.";
      setServerError(`${message} Proverite vezu i pokušajte ponovo.`);
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <div
        className={
          generalCopy
            ? "flex min-h-[320px] flex-col justify-between"
            : "flex min-h-[420px] flex-col justify-between border border-primary p-6 sm:p-8"
        }
        aria-live="polite"
      >
        <Check aria-hidden="true" className="size-10 text-accent-readable" strokeWidth={1.5} />
        <div>
          <h3
            ref={successHeadingRef}
            tabIndex={generalCopy ? -1 : undefined}
            className="text-2xl font-semibold tracking-[-0.04em] outline-none"
          >
            {generalCopy?.successTitle ?? "Zahtev je sačuvan."}
          </h3>
          <p className="mt-3 max-w-[42ch] leading-7 text-foreground/66">
            {generalCopy?.successBody ?? "Hvala. Javićemo se preko telefona ili imejla koji ste ostavili."}
          </p>
        </div>
      </div>
    );
  }

  // Opšta forma: polja sa linijom ispod (lead-form.module.css). Klasična ostaje ista.
  const control = generalCopy ? styles.line : "form-control";
  const field = generalCopy ? `form-field ${styles.field}` : "form-field";

  // Opšta forma drži mesto za poruku o grešci, pa poruka ne pomera polja.
  const errorFor = (field: FieldName) =>
    generalCopy ? (
      <p id={`${field}-error`} className="min-h-5 text-sm leading-5 text-destructive" aria-live="polite">
        {errors[field] ?? ""}
      </p>
    ) : errors[field] ? (
      <p id={`${field}-error`} className="text-sm leading-5 text-destructive" role="alert">
        {errors[field]}
      </p>
    ) : null;

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className={generalCopy ? `grid gap-5 ${styles.form}` : "grid gap-5"}
      aria-label={generalCopy?.formAria ?? "Zahtev za ScanMe ponudu"}
    >
      {status === "error" ? (
        <div className="border border-destructive bg-destructive/10 p-4 text-sm leading-6 text-destructive" role="alert">
          {serverError}
        </div>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <div className={field}>
          <Label htmlFor="contactName">Ime i prezime *</Label>
          <Input
            id="contactName"
            name="contactName"
            autoComplete="name"
            value={values.contactName}
            onChange={(event) => update("contactName", event.target.value)}
            onBlur={() => validateOnBlur("contactName")}
            aria-invalid={Boolean(errors.contactName)}
            aria-describedby={errors.contactName ? "contactName-error" : undefined}
            className={control}
          />
          {errorFor("contactName")}
        </div>

        <div className={field}>
          <Label htmlFor="businessName">Naziv biznisa *</Label>
          <Input
            id="businessName"
            name="businessName"
            autoComplete="organization"
            value={values.businessName}
            onChange={(event) => update("businessName", event.target.value)}
            onBlur={() => validateOnBlur("businessName")}
            aria-invalid={Boolean(errors.businessName)}
            aria-describedby={errors.businessName ? "businessName-error" : undefined}
            className={control}
          />
          {errorFor("businessName")}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className={field}>
          <Label htmlFor="businessType">Tip biznisa *</Label>
          <div className={generalCopy ? styles.selectWrap : undefined}>
            <select
              id="businessType"
              name="businessType"
              value={values.businessType}
              onChange={(event) => update("businessType", event.target.value)}
              onBlur={() => validateOnBlur("businessType")}
              aria-invalid={Boolean(errors.businessType)}
              aria-describedby={errors.businessType ? "businessType-error" : undefined}
              data-empty={values.businessType ? undefined : "true"}
              className={
                generalCopy
                  ? `${styles.line} ${styles.select}`
                  : "form-control h-12 w-full appearance-none px-3 text-base"
              }
            >
              <option value="">Izaberite</option>
              <option value="Kafić ili restoran">Kafić ili restoran</option>
              <option value="Salon ili studio">Salon ili studio</option>
              <option value="Prodavnica">Prodavnica</option>
              <option value="Klub ili prostor za događaje">Klub ili prostor za događaje</option>
              <option value="Uslužni biznis">Uslužni biznis</option>
              <option value="Drugo">Drugo</option>
            </select>
            {generalCopy ? <ChevronDown aria-hidden="true" className={styles.chevron} strokeWidth={1.75} /> : null}
          </div>
          {errorFor("businessType")}
        </div>

        <div className={field}>
          <Label htmlFor="city">{generalCopy?.cityLabel ?? "Grad"}</Label>
          {generalCopy ? (
            <Input
              id="city"
              name="city"
              autoComplete="address-level2"
              maxLength={80}
              value={values.city}
              onChange={(event) => update("city", event.target.value)}
              className={control}
            />
          ) : (
            <select
              id="city"
              name="city"
              autoComplete="address-level2"
              value={values.city}
              onChange={(event) => update("city", event.target.value)}
              className="form-control h-12 w-full px-3 text-base"
            >
              <option value="Beograd">Beograd</option>
            </select>
          )}
          {generalCopy ? errorFor("city") : null}
        </div>
      </div>

      <fieldset className="grid gap-3">
        <legend className="text-sm font-medium">Kontakt *</legend>
        <p className="text-sm leading-5 text-foreground/56">Dovoljan je telefon ili imejl.</p>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className={field}>
            <Label htmlFor="phone">Telefon</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={values.phone}
              onChange={(event) => update("phone", event.target.value)}
              onBlur={() => validateOnBlur("phone")}
              aria-invalid={Boolean(errors.phone)}
              aria-describedby={errors.phone ? "phone-error" : undefined}
              className={control}
            />
            {errorFor("phone")}
          </div>
          <div className={field}>
            <Label htmlFor="email">Imejl</Label>
            <Input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={values.email}
              onChange={(event) => update("email", event.target.value)}
              onBlur={() => validateOnBlur("email")}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "email-error" : undefined}
              className={control}
            />
            {errorFor("email")}
          </div>
        </div>
      </fieldset>

      {generalCopy ? (
        <div className={field}>
          <p id="interest-label" className={styles.groupLabel}>
            Zanima me *<span className={styles.groupHint}>{generalCopy.interestHint}</span>
          </p>
          <div
            role="group"
            aria-labelledby="interest-label"
            aria-describedby={errors.interest ? "interest-error" : undefined}
            data-invalid={errors.interest ? "true" : undefined}
            className={styles.chips}
          >
            {generalCopy.services.map((option, index) => {
              const pressed = services.includes(option.value);
              return (
                <button
                  key={option.value}
                  id={index === 0 ? "interest" : undefined}
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => toggleService(option.value)}
                  className={`focus-signal ${styles.chip}`}
                >
                  <Check aria-hidden="true" className={styles.chipCheck} strokeWidth={2.25} />
                  {option.label}
                  {option.tag ? (
                    <>
                      <span className="sr-only">, </span>
                      <span className={styles.chipTag}>{option.tag}</span>
                    </>
                  ) : null}
                </button>
              );
            })}
          </div>
          {errorFor("interest")}
        </div>
      ) : (
      <div className={field}>
        <Label htmlFor="interest">Zanima me *</Label>
        <Select
          name="interest"
          value={values.interest}
          onValueChange={(value) => update("interest", value as FormValues["interest"])}
        >
          <SelectTrigger
            id="interest"
            className="form-control h-12 w-full px-3 text-base"
            aria-label="Zanima me"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-[2px] border-border bg-popover p-0 shadow-none">
            <SelectItem value="review" className="min-h-11 rounded-none pr-3 pl-9">
              ScanMe Review
            </SelectItem>
            <SelectItem
              value="page"
              disabled
              className="min-h-11 rounded-none pr-24 pl-9 text-muted-foreground"
            >
              ScanMe Page
              <span className="absolute right-3 text-[0.68rem] font-semibold uppercase tracking-[0.14em]">
                U planu
              </span>
            </SelectItem>
            <SelectItem
              value="venue"
              disabled
              className="min-h-11 rounded-none pr-24 pl-9 text-muted-foreground"
            >
              ScanMe Venue
              <span className="absolute right-3 text-[0.68rem] font-semibold uppercase tracking-[0.14em]">
                U planu
              </span>
            </SelectItem>
            <SelectItem
              value="memories"
              disabled
              className="min-h-11 rounded-none pr-24 pl-9 text-muted-foreground"
            >
              ScanMe Memories
              <span className="absolute right-3 text-[0.68rem] font-semibold uppercase tracking-[0.14em]">
                U planu
              </span>
            </SelectItem>
            <SelectItem
              value="loyalty"
              disabled
              className="min-h-11 rounded-none pr-24 pl-9 text-muted-foreground"
            >
              ScanMe Loyalty
              <span className="absolute right-3 text-[0.68rem] font-semibold uppercase tracking-[0.14em]">
                U planu
              </span>
            </SelectItem>
            <SelectItem value="not_sure" className="min-h-11 rounded-none pr-3 pl-9">
              Nisam siguran
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      )}

      <div className={field}>
        <Label htmlFor="message">Poruka</Label>
        <Textarea
          id="message"
          name="message"
          rows={5}
          maxLength={messageMaxLength}
          value={values.message}
          onChange={(event) => update("message", event.target.value)}
          className={generalCopy ? `${styles.line} ${styles.textarea}` : "form-control min-h-32 resize-y"}
        />
      </div>

      <div className="hidden" aria-hidden="true">
        <Label htmlFor="website">Veb-sajt</Label>
        <Input
          id="website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={values.website}
          onChange={(event) => update("website", event.target.value)}
        />
      </div>

      <button
        type="submit"
        disabled={status === "pending"}
        className={`button-primary focus-signal mt-2 w-full${generalCopy ? " min-h-12" : ""}`}
      >
        {status === "pending" ? (
          <>
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" strokeWidth={1.75} />
            {generalCopy?.submitting ?? "Šaljemo zahtev..."}
          </>
        ) : (
          generalCopy?.submit ?? "Zatraži ponudu"
        )}
      </button>
    </form>
  );
}
