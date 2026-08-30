"use client";

import { ConvexError } from "convex/values";
import { useMutation } from "convex/react";
import {
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  UserRoundPlus,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Id } from "@/convex/_generated/dataModel";
import {
  InputField,
  RoleField,
  roleOptions,
  validateContactValues,
  type ContactDraft,
  type ContactValues,
} from "./create-business-popover";

// POC (point-of-contact) view shape shared by both admin modules. Both build it from the
// same Convex helper (buildBusinessContactViews), so it is identical across services.
export type PocInvitation = {
  id: Id<"businessInvitations">;
  status: string;
  expiresAt: number;
  failureReason: string | null;
  sentAt: number | null;
};

export type PocContact = {
  id: Id<"businessContacts">;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  positionTitle: string;
  status: "invited" | "active" | "inactive";
  invitation: PocInvitation | null;
};

export const invitationLabels: Record<string, string> = {
  queued: "Čeka slanje",
  sent: "Poslata",
  accepted: "Prihvaćena",
  failed: "Slanje nije uspelo",
  revoked: "Opozvana",
  expired: "Istekla",
};

function ContactForm({ initial, pending, submitLabel, onSubmit, onCancel }: { initial?: ContactValues; pending: boolean; submitLabel: string; onSubmit: (values: ContactValues) => Promise<boolean>; onCancel: () => void }) {
  const initialValues = initial ?? { firstName: "", lastName: "", email: "", phone: "", positionTitle: "" };
  const initialRole = roleOptions.includes(initialValues.positionTitle as (typeof roleOptions)[number]) ? initialValues.positionTitle as ContactDraft["roleChoice"] : initialValues.positionTitle ? "custom" : "";
  const [values, setValues] = useState<ContactValues>(initialValues);
  const [roleChoice, setRoleChoice] = useState<ContactDraft["roleChoice"]>(initialRole);
  const [customRole, setCustomRole] = useState(initialRole === "custom" ? initialValues.positionTitle : "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  function currentValues(): ContactValues {
    return { ...values, positionTitle: roleChoice === "custom" ? customRole : roleChoice };
  }

  function markTouched(field: string) {
    setTouched((current) => ({ ...current, [field]: true }));
    setErrors(validateContactValues(currentValues(), true));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateContactValues(currentValues(), true);
    setTouched({ firstName: true, lastName: true, email: true, phone: true, positionTitle: true });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      document.getElementById(Object.keys(nextErrors)[0])?.focus();
      return;
    }
    if (await onSubmit(currentValues())) onCancel();
  }

  return <form onSubmit={submit} noValidate className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2"><p className="text-xs leading-5 text-muted-foreground sm:col-span-2">Obavezni su samo ime i prezime. Email, telefon i uloga mogu se dodati kasnije.</p><InputField id="contact-form-firstName" label="Ime" value={values.firstName} required error={touched.firstName ? errors.firstName : undefined} onChange={(value) => setValues((current) => ({ ...current, firstName: value }))} onBlur={() => markTouched("firstName")} /><InputField id="contact-form-lastName" label="Prezime" value={values.lastName} required error={touched.lastName ? errors.lastName : undefined} onChange={(value) => setValues((current) => ({ ...current, lastName: value }))} onBlur={() => markTouched("lastName")} /><InputField id="contact-form-email" label="Email" type="email" value={values.email} error={touched.email ? errors.email : undefined} onChange={(value) => setValues((current) => ({ ...current, email: value }))} onBlur={() => markTouched("email")} /><InputField id="contact-form-phone" label="Telefon" type="tel" value={values.phone} error={touched.phone ? errors.phone : undefined} onChange={(value) => setValues((current) => ({ ...current, phone: value }))} onBlur={() => markTouched("phone")} /><RoleField id="contact-form-role" value={roleChoice} customValue={customRole} error={touched.positionTitle ? errors.positionTitle : undefined} onChange={(value) => { setRoleChoice(value); setValues((current) => ({ ...current, positionTitle: value === "custom" ? "" : value })); }} onCustomChange={(value) => { setCustomRole(value); setValues((current) => ({ ...current, positionTitle: value })); }} onBlur={() => markTouched("positionTitle")} /><div className="flex flex-wrap gap-2 sm:col-span-2"><Button type="submit" disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />} {submitLabel}</Button><Button type="button" variant="outline" disabled={pending} onClick={onCancel}>Otkaži</Button></div></form>;
}

export function ContactPanel({ contact, contacts, pending, onResend, onRevoke, onEdit, onReplace, onAdd, onDelete }: {
  contact: PocContact | null;
  contacts: PocContact[];
  pending: string | null;
  onResend: (invitationId: Id<"businessInvitations">) => void;
  onRevoke: (invitationId: Id<"businessInvitations">) => void;
  onEdit: (values: ContactValues, contactId: Id<"businessContacts">) => Promise<boolean>;
  onReplace: (values: ContactValues) => Promise<boolean>;
  onAdd: (values: ContactValues) => Promise<boolean>;
  onDelete: (contactId: Id<"businessContacts">) => void;
}) {
  const [mode, setMode] = useState<"edit" | "replace" | "add" | null>(null);
  const [activeContactId, setActiveContactId] = useState<Id<"businessContacts"> | null>(contact?.id ?? null);
  const resolvedContacts = contacts.length ? contacts : contact ? [contact] : [];
  const primaryContactId = contact?.id ?? null;
  const activeContact = resolvedContacts.find((candidate) => candidate.id === activeContactId) ?? contact;
  const activeInvitation = activeContact?.invitation ?? null;
  const isPrimary = activeContact?.id === primaryContactId;

  function chooseContact(value: string) {
    setActiveContactId(value as Id<"businessContacts">);
    setMode(null);
  }

  return (
    <div className="border border-border bg-card p-5 sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <h3 className="font-semibold">POC pristup</h3>
        {resolvedContacts.length ? (
          <div className="grid gap-2 sm:justify-items-end">
            <label htmlFor="choose-poc" className="text-xs text-muted-foreground">Choose POC</label>
            <Select value={activeContact?.id ?? ""} onValueChange={chooseContact}>
              <SelectTrigger id="choose-poc" className="h-11 w-full sm:w-56" aria-label="Choose POC">
                <SelectValue placeholder="Choose POC" />
              </SelectTrigger>
              <SelectContent>
                {resolvedContacts.map((candidate) => (
                  <SelectItem key={candidate.id} value={candidate.id}>
                    {candidate.firstName} {candidate.lastName}{candidate.id === primaryContactId ? " *" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      {activeContact ? (
        <dl className="mt-5 grid gap-3 text-sm">
          <div><dt className="text-xs text-muted-foreground">Kontakt</dt><dd className="mt-1">{activeContact.firstName} {activeContact.lastName}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Email i telefon</dt><dd className="mt-1 break-all">{activeContact.email}<br />{activeContact.phone}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Uloga</dt><dd className="mt-1">{activeContact.positionTitle}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Pozivnica</dt><dd className="mt-1">{activeInvitation ? invitationLabels[activeInvitation.status] ?? activeInvitation.status : "Nije kreirana"}</dd>{activeInvitation?.failureReason ? <p className="mt-2 text-xs leading-5 text-destructive">{activeInvitation.failureReason}</p> : null}</div>
        </dl>
      ) : <p className="mt-4 text-sm text-muted-foreground">POC nije dodat.</p>}

      {activeInvitation && activeInvitation.status !== "accepted" ? (
        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => onResend(activeInvitation.id)} disabled={pending === "invite"}><RefreshCw className="size-4" /> {activeInvitation.status === "queued" ? "Pošalji" : "Pošalji novu"}</Button>
          {activeInvitation.status !== "revoked" ? <Button type="button" variant="destructive" onClick={() => onRevoke(activeInvitation.id)} disabled={pending === "invite"}>Opozovi</Button> : null}
        </div>
      ) : null}

      <div className="mt-6 grid gap-2 border-t border-border pt-5">
        <Button type="button" variant={mode === "edit" ? "default" : "outline"} disabled={!activeContact || pending?.startsWith("contact:")} onClick={() => setMode(mode === "edit" ? null : "edit")}><Pencil className="size-4" /> Izmeni POC kontakt</Button>
        <Button type="button" variant={mode === "replace" ? "default" : "outline"} disabled={pending?.startsWith("contact:")} onClick={() => setMode(mode === "replace" ? null : "replace")}><UserRoundPlus className="size-4" /> Zameni POC kontakt</Button>
        <Button type="button" variant={mode === "add" ? "default" : "outline"} disabled={pending?.startsWith("contact:")} onClick={() => setMode(mode === "add" ? null : "add")}><Plus className="size-4" /> Dodaj novi POC kontakt</Button>
      </div>

      {mode === "edit" && activeContact ? <ContactForm initial={{ firstName: activeContact.firstName, lastName: activeContact.lastName, email: activeContact.email, phone: activeContact.phone, positionTitle: activeContact.positionTitle }} pending={pending === "contact:edit"} submitLabel="Sačuvaj izmene" onSubmit={(values) => onEdit(values, activeContact.id)} onCancel={() => setMode(null)} /> : null}
      {mode === "replace" ? <ContactForm pending={pending === "contact:replace"} submitLabel="Zameni kontakt" onSubmit={onReplace} onCancel={() => setMode(null)} /> : null}
      {mode === "add" ? <ContactForm pending={pending === "contact:add"} submitLabel="Dodaj POC kontakt" onSubmit={onAdd} onCancel={() => setMode(null)} /> : null}

      {activeContact && !isPrimary ? <Button type="button" variant="destructive" className="mt-4 w-full" disabled={pending === "contact:delete"} onClick={() => onDelete(activeContact.id)}><Trash2 className="size-4" /> Obriši POC</Button> : null}
    </div>
  );
}

function pocReasonMessage(reason: unknown) {
  return reason instanceof ConvexError && typeof reason.data === "string"
    ? reason.data
    : reason instanceof Error
      ? reason.message
      : "Operacija nije uspela.";
}

// Self-contained POC access card: owns the invitation/contact mutations and reports status
// through bottom-right toasts (near the action, not the top of the page). Used identically
// by both the ScanMe Review and ScanMe Links admin modules for full parity.
export function PocAccessCard({
  businessId,
  contact,
  contacts,
}: {
  businessId: Id<"businesses">;
  contact: PocContact | null;
  contacts: PocContact[];
}) {
  const resendInvitation = useMutation(api.admin.resendInvitation);
  const revokeInvitation = useMutation(api.admin.revokeInvitation);
  const updateContact = useMutation(api.admin.updateContact);
  const replaceContact = useMutation(api.admin.replaceContact);
  const addContact = useMutation(api.admin.addContact);
  const deleteContact = useMutation(api.admin.deleteContact);
  const [pending, setPending] = useState<string | null>(null);

  async function resend(invitationId: Id<"businessInvitations">) {
    setPending("invite");
    try {
      await resendInvitation({ invitationId });
      toast.success("Nova pozivnica je kreirana i stavljena u red za slanje.");
    } catch (reason) {
      toast.error(pocReasonMessage(reason));
    } finally {
      setPending(null);
    }
  }

  async function revoke(invitationId: Id<"businessInvitations">) {
    if (!window.confirm("Opozvati ovu pozivnicu? Link iz emaila više neće raditi.")) return;
    setPending("invite");
    try {
      await revokeInvitation({ invitationId });
      toast.success("Pozivnica je opozvana.");
    } catch (reason) {
      toast.error(pocReasonMessage(reason));
    } finally {
      setPending(null);
    }
  }

  async function submitContact(
    values: ContactValues,
    mode: "edit" | "replace" | "add",
    contactId?: Id<"businessContacts">,
  ) {
    setPending(`contact:${mode}`);
    try {
      if (mode === "edit") {
        if (!contactId) return false;
        const result = await updateContact({ businessId, contactId, ...values });
        toast.success(
          result.invitationId
            ? "POC kontakt je izmenjen. Pozivnica je pripremljena, ali email nije poslat automatski."
            : "POC kontakt je izmenjen. Status pozivnice nije promenjen.",
        );
      } else if (mode === "replace") {
        const result = await replaceContact({ businessId, ...values });
        toast.success(
          result.invitationId
            ? "POC kontakt je zamenjen, a pozivnica je pripremljena bez automatskog slanja emaila."
            : "POC kontakt je zamenjen. Email i pozivnica mogu se dodati kasnije.",
        );
      } else {
        await addContact({ businessId, ...values });
        toast.success("Novi POC kontakt je sačuvan. Email pozivnice nije poslat automatski.");
      }
      return true;
    } catch (reason) {
      toast.error(pocReasonMessage(reason));
      return false;
    } finally {
      setPending(null);
    }
  }

  async function removeContact(contactId: Id<"businessContacts">) {
    if (!window.confirm("Obrisati ovaj dodatni POC kontakt?")) return;
    setPending("contact:delete");
    try {
      await deleteContact({ businessId, contactId });
      toast.success("Dodatni POC kontakt je obrisan.");
    } catch (reason) {
      toast.error(pocReasonMessage(reason));
    } finally {
      setPending(null);
    }
  }

  return (
    <ContactPanel
      contact={contact}
      contacts={contacts}
      pending={pending}
      onResend={resend}
      onRevoke={revoke}
      onEdit={(values, contactId) => submitContact(values, "edit", contactId)}
      onReplace={(values) => submitContact(values, "replace")}
      onAdd={(values) => submitContact(values, "add")}
      onDelete={removeContact}
    />
  );
}
