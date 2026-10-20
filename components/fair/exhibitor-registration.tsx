"use client";

import Link from "next/link";
import { useMutation } from "convex/react";
import { CheckCircle2, ArrowUpRight, LoaderCircle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "framer-motion";
import { api } from "@/convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fairNewSubmissionId } from "./lead-form-model";
import { fmt } from "@/lib/i18n/format";
import type { FairExhibitorRegistrationDict } from "@/lib/i18n/types";
import { emptyExhibitorVehicle, exhibitorRegistrationMessage, exhibitorRegistrationSelection, type ExhibitorVehicleDraft } from "./exhibitor-registration-model";
import styles from "./exhibitor-registration.module.css";

function VehicleReveal({ children, reducedMotion }: { children: React.ReactNode; reducedMotion: boolean | null }) {
  const isPresent = useIsPresent();
  return <motion.div initial={reducedMotion ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: reducedMotion ? 0 : .3, ease: [.22, 1, .36, 1] }} className={styles.vehicleReveal} inert={!isPresent} aria-hidden={!isPresent} style={{ overflow: isPresent ? "visible" : "hidden" }}>
    {children}
  </motion.div>;
}

export function ExhibitorRegistration({ dict }: { dict: FairExhibitorRegistrationDict }) {
  const createLead = useMutation(api.leads.create);
  const startedAt = useRef(0);
  const submissionId = useRef<string | null>(null);
  const [status, setStatus] = useState<"idle" | "pending" | "success">("idle");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const reducedMotion = useReducedMotion();
  const [vehicles, setVehicles] = useState<ExhibitorVehicleDraft[]>([emptyExhibitorVehicle(0)]);
  const nextVehicleId = useRef(1);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => { startedAt.current = Date.now(); }, []);

  function updateVehicle(id: number, change: Partial<Pick<ExhibitorVehicleDraft, "model" | "package">>, finished = false) {
    const updated = vehicles.map((vehicle) => vehicle.id === id ? { ...vehicle, ...change } : vehicle);
    // Reveal the invitation only after editing finishes, never during typing.
    if (finished && updated.at(-1)!.model.trim()) updated.push(emptyExhibitorVehicle(nextVehicleId.current++));
    if (finished) while (updated.length > 1 && !updated.at(-1)!.model.trim() && !updated.at(-1)!.package && !updated.at(-2)!.model.trim() && !updated.at(-2)!.package) updated.pop();
    setVehicles(updated);
  }

  function removeVehicle(id: number, index: number) {
    const neighbor = vehicles[index + 1] ?? vehicles[index - 1];
    const input = formRef.current?.elements.namedItem(`vehicle-model-${neighbor?.id ?? id}`);
    if (input instanceof HTMLElement) input.focus({ preventScroll: true });
    const remaining = vehicles.filter((vehicle) => vehicle.id !== id);
    if (!remaining.length) remaining.push(emptyExhibitorVehicle(id));
    else if (remaining.at(-1)!.model.trim()) remaining.push(emptyExhibitorVehicle(nextVehicleId.current++));
    setVehicles(remaining);
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[`vehicle-model-${id}`];
      delete next[`vehicle-package-${id}`];
      return next;
    });
  }

  function fieldError(name: string) {
    return fieldErrors[name] ? <p id={`${name}-error`} className={styles.fieldError} role="alert">{fieldErrors[name]}</p> : null;
  }

  function errorProps(name: string) {
    return { "aria-invalid": !!fieldErrors[name], "aria-describedby": fieldErrors[name] ? `${name}-error` : undefined };
  }

  const requiredMark = <span aria-hidden="true" className={styles.required}>*</span>;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "pending") return;
    const data = new FormData(event.currentTarget);
    const value = (key: string) => String(data.get(key) ?? "").trim();
    const invalid: Record<string, string> = {};
    if (value("businessName").length < 2) invalid.businessName = dict.companyError;
    if (value("contactName").length < 2) invalid.contactName = dict.nameError;
    if (!value("phone") && !value("email")) invalid.phone = dict.contactError;
    if (value("phone") && value("phone").replace(/\D/g, "").length < 7) invalid.phone = dict.phoneError;
    if (value("email") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value("email"))) invalid.email = dict.emailError;
    vehicles.forEach((vehicle, index) => {
      if (vehicle.model.trim() || vehicle.package || index === 0) {
        if (vehicle.model.trim().length < 2) invalid[`vehicle-model-${vehicle.id}`] = dict.modelError;
        if (!vehicle.package) invalid[`vehicle-package-${vehicle.id}`] = dict.packageError;
      }
    });
    setFieldErrors(invalid);
    setError("");
    const firstInvalid = Object.keys(invalid)[0];
    if (firstInvalid) {
      const input = event.currentTarget.elements.namedItem(firstInvalid);
      if (input instanceof HTMLElement) input.focus();
      else if (input instanceof RadioNodeList) (input[0] as HTMLElement)?.focus();
      return;
    }
    const offerSelection = JSON.stringify(exhibitorRegistrationSelection(vehicles));
    if (offerSelection.length > 10_000) { setError(dict.lengthError); return; }
    submissionId.current ??= fairNewSubmissionId();
    setStatus("pending");
    setError("");
    try {
      await createLead({
        contactName: value("contactName"), businessName: value("businessName"),
        businessType: dict.source, email: value("email"), phone: value("phone"), interest: "not_sure",
        message: exhibitorRegistrationMessage(vehicles),
        offerSelection,
        submissionId: submissionId.current, formStartedAt: startedAt.current, website: value("website"),
      });
      setStatus("success");
    } catch {
      setError(dict.error);
      setStatus("idle");
    }
  }

  return <main className={styles.main}>
    <header className={styles.header}>
      <p className={styles.brand}>{dict.event}</p>
      <p className={styles.deadline}>{dict.deadline}</p>
      <h1>{dict.title}</h1>
      <p>{dict.intro}</p>
      <Link href="/sajam/demo-auto-moto-fest-2026">{dict.back}<ArrowUpRight size={16} aria-hidden="true" /></Link>
    </header>
    {status === "success" ? <section className={styles.success} role="status" tabIndex={-1} ref={(node) => node?.focus()}>
      <CheckCircle2 size={36} aria-hidden="true" /><h2>{dict.success}</h2><p>{dict.successBody}</p>
    </section> : <form ref={formRef} className={styles.form} onSubmit={submit} noValidate aria-busy={status === "pending"} onChange={(event) => {
      if (!(event.target instanceof HTMLInputElement)) return;
      const name = event.target.name;
      setFieldErrors((current) => {
        const next = { ...current };
        delete next[name];
        if (name === "phone" || name === "email") { delete next.phone; delete next.email; }
        return next;
      });
    }}>
      <fieldset disabled={status === "pending"} className={styles.fields}>
        <h2 className={`${styles.contactTitle} ${styles.wide}`}>{dict.contactHeading}</h2>
        <div className={styles.wide}><Label htmlFor="businessName">{dict.company} {requiredMark}</Label><Input id="businessName" name="businessName" autoComplete="organization" required minLength={2} maxLength={120} {...errorProps("businessName")} />{fieldError("businessName")}</div>
        <div className={styles.wide}><Label htmlFor="contactName">{dict.contact} {requiredMark}</Label><Input id="contactName" name="contactName" autoComplete="name" required minLength={2} maxLength={100} {...errorProps("contactName")} />{fieldError("contactName")}</div>
        <p className={`${styles.contactHint} ${styles.wide}`} id="contact-hint">{requiredMark} {dict.contactHint}</p>
        <div><Label htmlFor="phone">{dict.phone}</Label><Input id="phone" name="phone" type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required={!email.trim()} maxLength={40} {...errorProps("phone")} aria-describedby={`contact-hint${fieldErrors.phone ? " phone-error" : ""}`} />{fieldError("phone")}</div>
        <div><Label htmlFor="email">{dict.email}</Label><Input id="email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required={!phone.trim()} maxLength={160} {...errorProps("email")} aria-describedby={`contact-hint${fieldErrors.email ? " email-error" : ""}`} />{fieldError("email")}</div>
        <section className={`${styles.vehicleList} ${styles.wide}`} aria-labelledby="vehicles-title">
          <h2 id="vehicles-title">{dict.vehicles}</h2>
          <AnimatePresence initial={false}>
          {vehicles.map((vehicle, index) => <VehicleReveal key={vehicle.id} reducedMotion={reducedMotion}>
          <fieldset className={styles.vehicle}>
            <legend>{fmt(dict.vehicleNumber, { number: index + 1 })}</legend>
            <div className={styles.vehicleFields}>
            <div className={styles.vehicleModel}>
              <Label htmlFor={`vehicle-model-${vehicle.id}`}>{dict.model} {requiredMark}</Label>
              <Input id={`vehicle-model-${vehicle.id}`} name={`vehicle-model-${vehicle.id}`} value={vehicle.model} onChange={(event) => updateVehicle(vehicle.id, { model: event.target.value })} onBlur={(event) => updateVehicle(vehicle.id, { model: event.target.value.trim() }, true)} required={!!vehicle.package || index === 0} pattern=".*\S.*" minLength={2} maxLength={120} autoComplete="off" {...errorProps(`vehicle-model-${vehicle.id}`)} />
              {fieldError(`vehicle-model-${vehicle.id}`)}
            </div>
            <div role="group" aria-labelledby={`package-label-${vehicle.id}`} {...errorProps(`vehicle-package-${vehicle.id}`)}>
              <p id={`package-label-${vehicle.id}`} className={styles.packageLabel}>{dict.package} {requiredMark}</p>
              <div className={styles.packages}>
              {([['starter', dict.starter, dict.starterPrice], ['advanced', dict.advanced, dict.advancedPrice]] as const).map(([value, name, price]) => <label key={value}>
                <input type="radio" name={`vehicle-package-${vehicle.id}`} value={value} checked={vehicle.package === value} onChange={() => updateVehicle(vehicle.id, { package: value }, true)} required={!!vehicle.model.trim() || index === 0} {...errorProps(`vehicle-package-${vehicle.id}`)} /><span><strong>{name}</strong><small>{price}</small></span>
              </label>)}
              </div>
              {fieldError(`vehicle-package-${vehicle.id}`)}
            </div>
            </div>
            {(index < vehicles.length - 1 || vehicle.package) && <button type="button" className={styles.remove} onClick={() => removeVehicle(vehicle.id, index)} aria-label={fmt(dict.removeVehicle, { number: index + 1 })}><X size={18} aria-hidden="true" /></button>}
          </fieldset></VehicleReveal>)}
          </AnimatePresence>
          <p>{dict.packageNote}</p>
        </section>
        <div hidden aria-hidden="true"><label htmlFor="website">{dict.honeypot}</label><input id="website" name="website" tabIndex={-1} autoComplete="off" /></div>
      </fieldset>
      <p className={styles.privacy}>{dict.privacy}</p>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <button className={styles.submit} disabled={status === "pending"} type="submit">{status === "pending" && <LoaderCircle size={18} aria-hidden="true" />}{status === "pending" ? dict.pending : dict.submit}</button>
    </form>}
  </main>;
}
