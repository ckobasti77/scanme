"use client";

import { LoaderCircle, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const slugFormatMessage = "Format: mala slova a-z, cifre 0-9 i pojedinačne crtice između reči, bez razmaka ili crtice na početku/kraju (npr. naziv-lokala), najviše 66 karaktera.";
export const emailFormatMessage = "Unesite email u formatu ime@domen.rs.";
export const phoneFormatMessage = "Unesite 7–15 cifara; dozvoljeni su početni +, razmak, zagrade i crtica.";
export const roleOptions = ["Vlasnik", "Menadžer", "Radnik"] as const;

export type ContactValues = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  positionTitle: string;
};

export type ContactDraft = ContactValues & {
  id: number;
  roleChoice: (typeof roleOptions)[number] | "custom" | "";
  customRole: string;
};

export type CreateBusinessValues = {
  name: string;
  slug: string;
  destinationUrl: string;
  contacts: ContactValues[];
};

export function emptyContact(id: number): ContactDraft {
  return { id, firstName: "", lastName: "", email: "", phone: "", positionTitle: "", roleChoice: "", customRole: "" };
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/đ/g, "dj")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 66);
}

export function isValidEmail(value: string) {
  return value.trim().length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isValidPhone(value: string) {
  const phone = value.trim();
  const digitCount = (phone.match(/\d/g) ?? []).length;
  return digitCount >= 7 && digitCount <= 15 && /^\+?[0-9\s().-]+$/.test(phone);
}

export function isValidDestination(value: string) {
  if (!value.trim()) return true;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function validateContactValues(values: ContactValues, required: boolean) {
  const errors: Record<string, string> = {};
  const hasAnyValue = values.firstName.trim() || values.lastName.trim() || values.email.trim() || values.phone.trim() || values.positionTitle.trim();
  if (required || hasAnyValue) {
    if (values.firstName.trim().length < 2) errors.firstName = "Unesite ime od najmanje 2 karaktera.";
    if (values.lastName.trim().length < 2) errors.lastName = "Unesite prezime od najmanje 2 karaktera.";
    if (values.email.trim() && !isValidEmail(values.email)) errors.email = emailFormatMessage;
    if (values.phone.trim() && !isValidPhone(values.phone)) errors.phone = phoneFormatMessage;
    if (values.positionTitle.trim() && values.positionTitle.trim().length < 2) errors.positionTitle = "Unesite ulogu od najmanje 2 karaktera.";
  }
  return errors;
}

export function InputField({ id, label, value, onChange, onBlur, error, type = "text", placeholder, required = false, autoComplete }: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  error?: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="form-field">
      <Label htmlFor={id}>{label}{required ? " *" : ""}</Label>
      <Input id={id} type={type} value={value} placeholder={placeholder} required={required} autoComplete={autoComplete} onChange={(event) => onChange(event.target.value)} onBlur={onBlur} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} className="form-control h-11" />
      {error ? <p id={errorId} role="alert" className="text-xs leading-5 text-destructive">{error}</p> : null}
    </div>
  );
}

export function RoleField({ id, value, customValue, onChange, onCustomChange, onBlur, error, required = false }: {
  id: string;
  value: ContactDraft["roleChoice"];
  customValue: string;
  onChange: (value: ContactDraft["roleChoice"]) => void;
  onCustomChange: (value: string) => void;
  onBlur: () => void;
  error?: string;
  required?: boolean;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="form-field sm:col-span-2">
      <Label htmlFor={id}>Uloga u lokalu{required ? " *" : ""}</Label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value as ContactDraft["roleChoice"])} onBlur={onBlur} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} className="form-control h-11 cursor-pointer px-3">
        <option value="">Izaberite ulogu</option>
        {roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}
        <option value="custom">Upiši sam</option>
      </select>
      {value === "custom" ? <Input id={`${id}-custom`} value={customValue} placeholder="Upišite ulogu" onChange={(event) => onCustomChange(event.target.value)} onBlur={onBlur} aria-invalid={Boolean(error)} className="form-control h-11" /> : null}
      {error ? <p id={errorId} role="alert" className="text-xs leading-5 text-destructive">{error}</p> : null}
    </div>
  );
}

export function CreateBusinessPopover({ pending, onSubmit }: { pending: boolean; onSubmit: (values: CreateBusinessValues) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button type="button" className="button-primary cursor-pointer" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <Plus className="size-4" /> Dodaj lokal
      </button>
      <div hidden={!open} className="mt-4 border border-border bg-card p-5 sm:absolute sm:right-0 sm:z-10 sm:w-[680px] sm:max-w-[90vw]">
        <CreateBusinessForm pending={pending} onSubmit={async (values) => { const saved = await onSubmit(values); if (saved) setOpen(false); return saved; }} />
      </div>
    </div>
  );
}

export function CreateBusinessForm({ pending, onSubmit }: { pending: boolean; onSubmit: (values: CreateBusinessValues) => Promise<boolean> }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [contacts, setContacts] = useState<ContactDraft[]>([emptyContact(1)]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const nextContactId = useRef(2);
  const slugEdited = useRef(false);

  function draftValues(): CreateBusinessValues {
    return {
      name,
      slug,
      destinationUrl,
      contacts: contacts.filter((contact) => contact.firstName || contact.lastName || contact.email || contact.phone || contact.roleChoice || contact.customRole).map((contact) => ({
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        phone: contact.phone,
        positionTitle: contact.roleChoice === "custom" ? contact.customRole : contact.roleChoice,
      })),
    };
  }

  function validate(values: CreateBusinessValues) {
    const nextErrors: Record<string, string> = {};
    if (values.name.trim().length < 2) nextErrors.name = "Naziv lokala mora imati najmanje 2 karaktera.";
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(values.slug.trim()) || values.slug.trim().length > 66) nextErrors.slug = slugFormatMessage;
    if (!isValidDestination(values.destinationUrl)) nextErrors.destinationUrl = "Unesite javni HTTPS URL ili ostavite polje prazno.";
    contacts.forEach((contact) => {
      const contactValues = { ...contact, positionTitle: contact.roleChoice === "custom" ? contact.customRole : contact.roleChoice };
      const contactErrors = validateContactValues(contactValues, false);
      Object.entries(contactErrors).forEach(([field, message]) => { nextErrors[`contact-${contact.id}-${field}`] = message; });
    });
    return nextErrors;
  }

  function markTouched(key: string) {
    setTouched((current) => ({ ...current, [key]: true }));
    const nextErrors = validate(draftValues());
    setErrors((current) => {
      const next = { ...current };
      if (nextErrors[key]) next[key] = nextErrors[key]; else delete next[key];
      return next;
    });
  }

  function updateContact(id: number, patch: Partial<ContactDraft>) {
    setContacts((current) => current.map((contact) => contact.id === id ? { ...contact, ...patch } : contact));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = draftValues();
    const nextErrors = validate(values);
    const allTouched = Object.keys(nextErrors).reduce<Record<string, boolean>>((result, key) => ({ ...result, [key]: true }), { name: true, slug: true, destinationUrl: true });
    setTouched(allTouched);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      document.getElementById(Object.keys(nextErrors)[0])?.focus();
      return;
    }
    if (await onSubmit(values)) {
      setName("");
      setSlug("");
      setDestinationUrl("");
      setContacts([emptyContact(1)]);
      setErrors({});
      setTouched({});
      slugEdited.current = false;
      nextContactId.current = 2;
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <h2 className="text-xl font-semibold">Novi lokal</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Obavezni su samo naziv lokala i osnovni slug. Google Review adresa automatski dobija nastavak -google-review.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <InputField id="create-business-name" label="Naziv lokala" value={name} required error={touched.name ? errors.name : undefined} onChange={(value) => { setName(value); if (!slugEdited.current) setSlug(slugify(value)); }} onBlur={() => markTouched("name")} />
        <InputField id="create-business-slug" label="Osnovni slug" value={slug} required placeholder="naziv-lokala" error={touched.slug ? errors.slug : undefined} onChange={(value) => { slugEdited.current = true; setSlug(value.toLowerCase().replace(/\s+/g, "-")); }} onBlur={() => markTouched("slug")} />
        <div className="sm:col-span-2"><InputField id="create-destination-url" label="Google Review / Dynamic Link" type="url" value={destinationUrl} error={touched.destinationUrl ? errors.destinationUrl : undefined} onChange={setDestinationUrl} onBlur={() => markTouched("destinationUrl")} /></div>
        <div className="sm:col-span-2 border-t border-border pt-5">
          <h3 className="font-semibold">POC kontakti</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">POC blok je opcioni. Ako ga dodate, obavezni su samo ime i prezime.</p>
        </div>
        {contacts.map((contact, index) => {
          const prefix = `contact-${contact.id}`;
          return <fieldset key={contact.id} className="sm:col-span-2 grid gap-4 border border-border p-4 sm:grid-cols-2"><legend className="px-2 text-sm font-semibold">POC {index + 1}</legend><InputField id={`${prefix}-firstName`} label="Ime" value={contact.firstName} error={touched[`${prefix}-firstName`] ? errors[`${prefix}-firstName`] : undefined} onChange={(value) => updateContact(contact.id, { firstName: value })} onBlur={() => markTouched(`${prefix}-firstName`)} /><InputField id={`${prefix}-lastName`} label="Prezime" value={contact.lastName} error={touched[`${prefix}-lastName`] ? errors[`${prefix}-lastName`] : undefined} onChange={(value) => updateContact(contact.id, { lastName: value })} onBlur={() => markTouched(`${prefix}-lastName`)} /><InputField id={`${prefix}-email`} label="POC email" type="email" value={contact.email} error={touched[`${prefix}-email`] ? errors[`${prefix}-email`] : undefined} onChange={(value) => updateContact(contact.id, { email: value })} onBlur={() => markTouched(`${prefix}-email`)} /><InputField id={`${prefix}-phone`} label="Telefon" type="tel" value={contact.phone} error={touched[`${prefix}-phone`] ? errors[`${prefix}-phone`] : undefined} onChange={(value) => updateContact(contact.id, { phone: value })} onBlur={() => markTouched(`${prefix}-phone`)} /><RoleField id={`${prefix}-role`} value={contact.roleChoice} customValue={contact.customRole} error={touched[`${prefix}-positionTitle`] ? errors[`${prefix}-positionTitle`] : undefined} onChange={(value) => updateContact(contact.id, { roleChoice: value, positionTitle: value === "custom" ? "" : value })} onCustomChange={(value) => updateContact(contact.id, { customRole: value, positionTitle: value })} onBlur={() => markTouched(`${prefix}-positionTitle`)} />{contacts.length > 1 ? <Button type="button" size="sm" variant="ghost" className="justify-self-start text-destructive hover:text-destructive" onClick={() => setContacts((current) => current.filter((item) => item.id !== contact.id))}><Trash2 className="size-4" /> Ukloni POC</Button> : null}</fieldset>;
        })}
      </div>
      <Button type="button" variant="outline" className="mt-4" onClick={() => { setContacts((current) => [...current, emptyContact(nextContactId.current)]); nextContactId.current += 1; }}><Plus className="size-4" /> Dodaj novog POC-a</Button>
      <div><Button type="submit" className="mt-5" disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />} Sačuvaj lokal</Button></div>
    </form>
  );
}
