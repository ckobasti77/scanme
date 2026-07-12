"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { Check, LoaderCircle } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type FormValues = {
  contactName: string;
  businessName: string;
  businessType: string;
  phone: string;
  email: string;
  city: string;
  interest: "review" | "page" | "venue" | "memories" | "not_sure";
  message: string;
  website: string;
};

type FieldName = keyof FormValues;
type FieldErrors = Partial<Record<FieldName, string>>;

const initialValues: FormValues = {
  contactName: "",
  businessName: "",
  businessType: "",
  phone: "",
  email: "",
  city: "",
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

export function LeadForm() {
  const createLead = useMutation(api.leads.create);
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [serverError, setServerError] = useState("");
  const formStartedAt = useRef(0);
  const submissionId = useRef<string | null>(null);

  useEffect(() => {
    formStartedAt.current = Date.now();
  }, []);

  const update = (field: FieldName, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    if (errors[field]) {
      setErrors((current) => ({ ...current, [field]: undefined }));
    }
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
    setErrors(nextErrors);
    const firstInvalid = Object.keys(nextErrors)[0] as FieldName | undefined;
    if (firstInvalid) {
      document.getElementById(firstInvalid)?.focus();
      return;
    }

    setStatus("pending");
    setServerError("");
    submissionId.current ??= crypto.randomUUID();

    try {
      const request = createLead({
        contactName: values.contactName,
        businessName: values.businessName,
        businessType: values.businessType,
        ...(values.city.trim() ? { city: values.city } : {}),
        ...(values.email.trim() ? { email: values.email } : {}),
        ...(values.phone.trim() ? { phone: values.phone } : {}),
        interest: values.interest,
        ...(values.message.trim() ? { message: values.message } : {}),
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
        error instanceof Error
          ? error.message.replace(/^.*?Uncaught Error:\s*/, "")
          : "Zahtev trenutno nije moguće poslati.";
      setServerError(`${message} Proverite vezu i pokušajte ponovo.`);
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <div className="flex min-h-[420px] flex-col justify-between border border-[#c6ff4a] p-6 sm:p-8" aria-live="polite">
        <Check aria-hidden="true" className="size-10 text-[#c6ff4a]" strokeWidth={1.5} />
        <div>
          <h3 className="text-2xl font-semibold tracking-[-0.04em]">Zahtev je sačuvan.</h3>
          <p className="mt-3 max-w-[42ch] leading-7 text-white/66">
            Hvala. Javićemo se preko telefona ili imejla koji ste ostavili.
          </p>
        </div>
      </div>
    );
  }

  const errorFor = (field: FieldName) =>
    errors[field] ? (
      <p id={`${field}-error`} className="text-sm leading-5 text-[#ff8f86]" role="alert">
        {errors[field]}
      </p>
    ) : null;

  return (
    <form noValidate onSubmit={handleSubmit} className="grid gap-5" aria-label="Zahtev za ScanMe ponudu">
      {status === "error" ? (
        <div className="border border-[#ff8f86] p-4 text-sm leading-6 text-[#ffd2ce]" role="alert">
          {serverError}
        </div>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="form-field">
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
            className="form-control"
          />
          {errorFor("contactName")}
        </div>

        <div className="form-field">
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
            className="form-control"
          />
          {errorFor("businessName")}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="form-field">
          <Label htmlFor="businessType">Tip biznisa *</Label>
          <select
            id="businessType"
            name="businessType"
            value={values.businessType}
            onChange={(event) => update("businessType", event.target.value)}
            onBlur={() => validateOnBlur("businessType")}
            aria-invalid={Boolean(errors.businessType)}
            aria-describedby={errors.businessType ? "businessType-error" : undefined}
            className="form-control h-12 w-full appearance-none px-3 text-base"
          >
            <option value="">Izaberite</option>
            <option value="Kafić ili restoran">Kafić ili restoran</option>
            <option value="Salon ili studio">Salon ili studio</option>
            <option value="Prodavnica">Prodavnica</option>
            <option value="Klub ili prostor za događaje">Klub ili prostor za događaje</option>
            <option value="Uslužni biznis">Uslužni biznis</option>
            <option value="Drugo">Drugo</option>
          </select>
          {errorFor("businessType")}
        </div>

        <div className="form-field">
          <Label htmlFor="city">Grad</Label>
          <Input
            id="city"
            name="city"
            autoComplete="address-level2"
            value={values.city}
            onChange={(event) => update("city", event.target.value)}
            className="form-control"
          />
        </div>
      </div>

      <fieldset className="grid gap-3">
        <legend className="text-sm font-medium">Kontakt *</legend>
        <p className="text-sm leading-5 text-white/56">Dovoljan je telefon ili imejl.</p>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="form-field">
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
              className="form-control"
            />
            {errorFor("phone")}
          </div>
          <div className="form-field">
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
              className="form-control"
            />
            {errorFor("email")}
          </div>
        </div>
      </fieldset>

      <div className="form-field">
        <Label htmlFor="interest">Zanima me *</Label>
        <select
          id="interest"
          name="interest"
          value={values.interest}
          onChange={(event) => update("interest", event.target.value)}
          className="form-control h-12 w-full appearance-none px-3 text-base"
        >
          <option value="review">ScanMe Review</option>
          <option value="page">ScanMe Page</option>
          <option value="venue">ScanMe Venue</option>
          <option value="memories">ScanMe Memories</option>
          <option value="not_sure">Nisam siguran</option>
        </select>
      </div>

      <div className="form-field">
        <Label htmlFor="message">Poruka</Label>
        <Textarea
          id="message"
          name="message"
          rows={5}
          maxLength={1000}
          value={values.message}
          onChange={(event) => update("message", event.target.value)}
          className="form-control min-h-32 resize-y"
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

      <button type="submit" disabled={status === "pending"} className="button-primary focus-signal mt-2 w-full">
        {status === "pending" ? (
          <>
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" strokeWidth={1.75} />
            Šaljemo zahtev...
          </>
        ) : (
          "Zatraži ponudu"
        )}
      </button>
    </form>
  );
}
