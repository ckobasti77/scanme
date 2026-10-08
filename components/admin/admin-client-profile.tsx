"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Check,
  CircleDollarSign,
  ExternalLink,
  Globe,
  Link2,
  Mail,
  MapPin,
  MessageSquareText,
  Pencil,
  Phone,
  Plus,
  Star,
  UtensilsCrossed,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Component, useRef, useState, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { normalizeWebsiteUrl, websiteLabel } from "@/lib/admin-v1/website";
import { adminV1Sr as dict } from "@/lib/i18n/sr/admin-v1";
import { cn } from "@/lib/utils";
import { AdminConversationWorkspace } from "./admin-inbox";
import { AdminClientFinanceSummary } from "./admin-finance";
import { AdminErrorState, AdminLoadingState, AdminPanel, AdminStatus } from "./admin-primitives";
import { AdminDataCard, AdminDataView, type AdminColumn } from "./admin-ui";

type ProfileResult = FunctionReturnType<typeof api.adminClientProfiles.getProfile>;
type Profile = NonNullable<ProfileResult>;
type Contact = Profile["contacts"][number];
type Action = Profile["openActions"][number];
type Venue = FunctionReturnType<typeof api.adminClientProfiles.listVenues>["page"][number];
type VenueDetail = NonNullable<FunctionReturnType<typeof api.adminClientProfiles.getVenueDetail>>;
type Activity = FunctionReturnType<typeof api.adminClientProfiles.listActivity>["page"][number];
type Section = "overview" | "venues" | "finance" | "products" | "communication" | "activity";

const SECTIONS: Array<{ id: Section; label: string }> = [
  { id: "overview", label: dict.clientProfileSectionOverview },
  { id: "venues", label: dict.clientProfileSectionVenues },
  { id: "finance", label: dict.clientProfileSectionFinance },
  { id: "products", label: dict.clientProfileSectionProducts },
  { id: "communication", label: dict.clientProfileSectionCommunication },
  { id: "activity", label: dict.clientProfileSectionActivity },
];

const serviceMeta = {
  scanme_links: { label: dict.clientsServiceLinks, icon: Link2 },
  google_review: { label: dict.clientsServiceReview, icon: Star },
  scanme_menu: { label: dict.clientsServiceMenu, icon: UtensilsCrossed },
} as const;

const stateLabel: Record<string, string> = {
  active: dict.clientsServiceActive,
  warning: dict.clientsServiceWarning,
  grace: dict.clientsServiceGrace,
  suspended: dict.clientsServiceSuspended,
  inactive: dict.clientsServiceInactive,
  problem: dict.clientsServiceProblem,
  archived: dict.clientProfileArchived,
};

const controlClass = "min-h-11 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-3 text-sm outline-none focus-visible:border-[var(--admin-focus)] focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]/25";
const subtleButton = "admin-button-ghost min-h-11 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-3 text-sm font-semibold hover:border-[var(--admin-ink)]";

function dateLabel(value: number | null) {
  return value ? new Intl.DateTimeFormat("sr-Latn-RS", { dateStyle: "medium" }).format(value) : "—";
}

function dateTimeLabel(value: number) {
  return new Intl.DateTimeFormat("sr-Latn-RS", { dateStyle: "medium", timeStyle: "short" }).format(value);
}

function severityClass(severity: Action["severity"]) {
  return severity === "blocking"
    ? "border-[var(--admin-danger-border)] bg-[var(--admin-danger-soft)] text-[var(--admin-danger)]"
    : severity === "warning"
      ? "border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)] text-[var(--admin-warning)]"
      : "border-[var(--admin-border)] bg-[var(--admin-surface-muted)] text-[var(--admin-text)]";
}

function updateUrl(
  router: ReturnType<typeof useRouter>,
  pathname: string,
  current: URLSearchParams,
  key: "section" | "contact" | "venue",
  value?: string,
) {
  const next = new URLSearchParams(current.toString());
  if (value) next.set(key, value);
  else next.delete(key);
  router.push(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
}

/** Izlagači 2026: the client's website — open it, add it or change it in place. */
function ProfileWebsite({ websiteUrl, onSave }: { websiteUrl: string | null; onSave: (websiteUrl: string | null) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(websiteUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const raw = draft.trim();
    const next = raw ? normalizeWebsiteUrl(raw) : null;
    if (raw && !next) { setError(dict.clientProfileWebsiteInvalid); return; }
    setBusy(true);
    setError(null);
    try {
      await onSave(next);
      setEditing(false);
    } catch {
      setError(dict.clientProfileWebsiteError);
    } finally {
      setBusy(false);
    }
  }
  if (editing) {
    return (
      <form onSubmit={submit} className="mt-4 flex max-w-xl flex-wrap items-start gap-2" noValidate>
        <label className="sr-only" htmlFor="client-website">{dict.clientProfileWebsite}</label>
        <Input id="client-website" type="url" inputMode="url" autoComplete="url" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={dict.clientProfileWebsitePlaceholder} aria-invalid={error ? true : undefined} aria-describedby={error ? "client-website-error" : undefined} className="min-h-11 min-w-0 flex-1 basis-64" autoFocus />
        <Button type="submit" className="min-h-11" disabled={busy}>{dict.clientProfileWebsiteSave}</Button>
        <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => { setEditing(false); setDraft(websiteUrl ?? ""); setError(null); }}>{dict.clientProfileCancel}</Button>
        {error ? <p id="client-website-error" role="alert" className="basis-full text-sm text-[var(--admin-danger)]">{error}</p> : null}
      </form>
    );
  }
  return (
    <div className="mt-4 flex min-w-0 flex-wrap items-center gap-2 text-sm">
      <Globe className="size-4 shrink-0 text-[var(--admin-text-muted)]" aria-hidden="true" />
      {websiteUrl ? (
        <a href={websiteUrl} target="_blank" rel="noopener noreferrer" aria-label={`${dict.clientProfileWebsiteOpen}: ${websiteLabel(websiteUrl)}`} className="inline-flex min-h-11 min-w-0 items-center gap-1.5 font-semibold break-all underline-offset-4 hover:underline">
          {websiteLabel(websiteUrl)}
          <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
        </a>
      ) : <span className="text-[var(--admin-text-muted)]">{dict.clientProfileWebsiteEmpty}</span>}
      <button type="button" onClick={() => { setDraft(websiteUrl ?? ""); setEditing(true); }} className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-[var(--admin-text-muted)] hover:bg-[var(--admin-surface-muted)] hover:text-[var(--admin-ink)]">
        <Pencil className="size-3.5" aria-hidden="true" />
        {websiteUrl ? dict.clientProfileWebsiteEdit : dict.clientProfileWebsiteAdd}
      </button>
    </div>
  );
}

function ProfileHeader({ profile, onWebsite }: { profile: Profile; onWebsite: (websiteUrl: string | null) => Promise<void> }) {
  const premiumLabel = profile.premiumStatus === "active"
    ? dict.clientProfilePremiumActive
    : profile.premiumStatus === "grace"
      ? dict.clientProfilePremiumGrace
      : profile.premiumStatus === "suspended"
        ? dict.clientProfilePremiumSuspended
        : profile.premiumStatus === "inactive"
          ? dict.clientProfilePremiumInactive
          : dict.clientProfileNoPremium;
  return (
    <header className="min-w-0">
      <Link href="/admin/klijenti" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold underline-offset-4 hover:underline">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {dict.clientProfileBack}
      </Link>
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
        <span className="font-mono text-xs font-semibold text-[var(--admin-text-muted)]">{profile.smkCode}</span>
        <AdminStatus label={profile.status === "active" ? dict.statusActive : dict.clientProfileArchived} tone={profile.status === "active" ? "active" : "neutral"} />
        {profile.premiumStatus ? <span className={cn("inline-flex min-h-7 items-center rounded-full border px-2.5 text-xs font-semibold", profile.premiumStatus === "active" ? "border-[var(--admin-success-border)] bg-[var(--admin-accent)] text-[var(--admin-accent-ink)]" : "border-[var(--admin-border)] bg-[var(--admin-surface-muted)] text-[var(--admin-text-muted)]")}>{premiumLabel}</span> : null}
      </div>
      <h1 className="mt-3 max-w-5xl text-[clamp(2rem,4.5vw,4.2rem)] leading-[0.96] font-medium tracking-[-0.055em] break-words">{profile.ownerDisplayName}</h1>
      {profile.accountName !== profile.ownerDisplayName ? <p className="mt-2 text-sm font-semibold text-[var(--admin-text-muted)]">{profile.accountName}</p> : null}
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--admin-text-muted)]">{dict.clientProfileSubtitle}</p>
      <ProfileWebsite key={profile.websiteUrl ?? ""} websiteUrl={profile.websiteUrl} onSave={onWebsite} />
      <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
        <span className="rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 py-2">{profile.venueCount} {dict.clientProfileVenues}</span>
        <span className={cn("rounded-full border px-3 py-2", profile.openActionCount ? "border-[var(--admin-danger-border)] bg-[var(--admin-danger-soft)] text-[var(--admin-danger)]" : "border-[var(--admin-border)] bg-[var(--admin-surface)]")}>{profile.openActionCountCapped ? dict.clientProfileProblemCountCapped : profile.openActionCount === 1 ? dict.clientProfileOneProblem : `${profile.openActionCount} ${dict.clientProfileProblems}`}</span>
      </div>
    </header>
  );
}

function ContactCard({
  profile,
  selected,
  onSelect,
  onAdd,
  onEdit,
  onDefault,
  onStatus,
  pending,
}: {
  profile: Profile;
  selected: Contact;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onEdit: (contact: Contact) => void;
  onDefault: (contact: Contact) => void;
  onStatus: (contact: Contact) => void;
  pending: boolean;
}) {
  return (
    <AdminPanel className="min-w-0 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold tracking-[0.04em] uppercase">{dict.clientProfileContacts}</h2>
        <button type="button" onClick={onAdd} className="grid size-11 place-items-center rounded-xl border border-[var(--admin-border)]" aria-label={dict.clientProfileAddContact}><Plus className="size-4" aria-hidden="true" /></button>
      </div>
      <label className="mt-4 grid gap-1.5 text-xs font-semibold text-[var(--admin-text-muted)]">
        {dict.clientProfileContactSelect}
        <select value={selected.id} onChange={(event) => onSelect(event.target.value)} className={controlClass}>
          {profile.contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.displayName}{contact.isDefault ? ` · ${dict.clientProfileDefaultContact}` : ""}</option>)}
        </select>
      </label>
      <div className="mt-4 min-w-0 border-t border-[var(--admin-border)] pt-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <strong className="truncate">{selected.displayName}</strong>
          {selected.isDefault ? <span className="rounded-full bg-[var(--admin-accent)] px-2 py-1 text-[0.65rem] font-bold text-[var(--admin-accent-ink)]">{dict.clientProfileDefaultContact}</span> : null}
          {selected.isOwner ? <span className="rounded-full border border-[var(--admin-border)] px-2 py-1 text-[0.65rem] font-bold">{dict.clientProfileOwnerContact}</span> : null}
          {selected.status === "inactive" ? <span className="rounded-full border border-[var(--admin-border)] px-2 py-1 text-[0.65rem] font-bold text-[var(--admin-text-muted)]">{dict.clientProfileInactiveContact}</span> : null}
        </div>
        <p className="mt-1 text-xs text-[var(--admin-text-muted)]">{selected.positionTitle}</p>
        <div className="mt-4 grid gap-2 text-sm">
          {selected.email ? <a href={`mailto:${selected.email}`} className="flex min-w-0 items-center gap-2 hover:underline"><Mail className="size-4 shrink-0" aria-hidden="true" /><span className="truncate">{selected.email}</span></a> : null}
          {selected.phone ? <a href={`tel:${selected.phone}`} className="flex items-center gap-2 hover:underline"><Phone className="size-4 shrink-0" aria-hidden="true" />{selected.phone}</a> : null}
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {!selected.isDefault && selected.status === "active" ? <button disabled={pending} type="button" onClick={() => onDefault(selected)} className={subtleButton}>{dict.clientProfileSetDefault}</button> : null}
          <button disabled={pending} type="button" onClick={() => onEdit(selected)} className={subtleButton}><Pencil className="mr-2 inline size-4" aria-hidden="true" />{dict.clientProfileEditContact}</button>
          {!selected.isDefault ? <button disabled={pending} type="button" onClick={() => onStatus(selected)} className={subtleButton}>{selected.status === "active" ? dict.clientProfileDeactivateContact : dict.clientProfileReactivateContact}</button> : null}
        </div>
      </div>
    </AdminPanel>
  );
}

type ContactDraft = { firstName: string; lastName: string; positionTitle: string; email: string; phone: string };
const EMPTY_CONTACT: ContactDraft = { firstName: "", lastName: "", positionTitle: "", email: "", phone: "" };

function ContactDialog({ open, contact, busy, error, onOpenChange, onSubmit }: { open: boolean; contact: Contact | null; busy: boolean; error: string; onOpenChange: (value: boolean) => void; onSubmit: (draft: ContactDraft) => Promise<void> }) {
  const [draft, setDraft] = useState<ContactDraft>(() => contact ? { firstName: contact.firstName, lastName: contact.lastName, positionTitle: contact.positionTitle, email: contact.email ?? "", phone: contact.phone ?? "" } : EMPTY_CONTACT);
  const [validation, setValidation] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.firstName.trim() || !draft.lastName.trim() || !draft.positionTitle.trim()) return setValidation(dict.clientProfileContactRequired);
    if (draft.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)) return setValidation(dict.clientProfileContactInvalidEmail);
    const digits = draft.phone.replace(/\D/g, "");
    if (draft.phone && (digits.length < 7 || digits.length > 15)) return setValidation(dict.clientProfileContactInvalidPhone);
    setValidation("");
    await onSubmit(draft);
  }
  const fields: Array<{ key: keyof ContactDraft; label: string; type?: string; autoComplete?: string }> = [
    { key: "firstName", label: dict.clientProfileContactFirstName, autoComplete: "given-name" },
    { key: "lastName", label: dict.clientProfileContactLastName, autoComplete: "family-name" },
    { key: "positionTitle", label: dict.clientProfileContactPosition, autoComplete: "organization-title" },
    { key: "email", label: dict.clientProfileContactEmail, type: "email", autoComplete: "email" },
    { key: "phone", label: dict.clientProfileContactPhone, type: "tel", autoComplete: "tel" },
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="admin-v1 max-h-[calc(100dvh-2rem)] overflow-y-auto border-[var(--admin-border)] bg-[var(--admin-surface-strong)]">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader><DialogTitle>{contact ? dict.clientProfileEditContact : dict.clientProfileAddContact}</DialogTitle><DialogDescription>{dict.clientProfileContacts}</DialogDescription></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((field) => <label key={field.key} className={cn("grid gap-1.5 text-sm font-semibold", field.key === "positionTitle" && "sm:col-span-2")}><span>{field.label}{field.key === "firstName" || field.key === "lastName" || field.key === "positionTitle" ? " *" : ""}</span><Input type={field.type} autoComplete={field.autoComplete} value={draft[field.key]} onChange={(event) => setDraft((value) => ({ ...value, [field.key]: event.target.value }))} className="min-h-11 rounded-xl border-[var(--admin-border)]" /></label>)}
          </div>
          {validation || error ? <p role="alert" className="text-sm text-[var(--admin-danger)]">{validation || error}</p> : null}
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="min-h-11">{dict.clientProfileCancel}</Button><Button disabled={busy} type="submit" className="min-h-11 bg-[var(--admin-ink)] text-[var(--admin-surface)]">{dict.clientProfileSaveContact}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProblemDialog({ profile, action, open, onClose, onResolve, live }: { profile: Profile; action: Action | null; open: boolean; onClose: () => void; onResolve: (action: Action, note: string) => Promise<void>; live: boolean }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const history = usePaginatedQuery(api.adminClientProfiles.listActionHistory, action && open && live ? { accountId: profile.accountId, actionItemId: action.id } : "skip", { initialNumItems: 12 });
  async function resolve() {
    if (!action || !note.trim()) return setError(dict.clientProfileResolutionNoteRequired);
    setBusy(true); setError("");
    try { await onResolve(action, note.trim()); onClose(); } catch { setError(dict.clientProfileMutationError); } finally { setBusy(false); }
  }
  return (
    <Dialog open={Boolean(action) && open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent className="admin-v1 max-h-[calc(100dvh-2rem)] overflow-y-auto border-[var(--admin-border)] bg-[var(--admin-surface-strong)]">
        {action ? <>
          <DialogHeader><DialogTitle>{dict.clientProfileProblemTitle}</DialogTitle><DialogDescription>{action.description ?? action.causeId}</DialogDescription></DialogHeader>
          <div className="grid gap-3 text-sm">
            <span className="font-mono text-xs text-[var(--admin-text-muted)]">{action.causeId}</span>
            {action.contextHref ? <Link href={action.contextHref} className="inline-flex min-h-11 items-center gap-2 font-semibold underline"><ExternalLink className="size-4" aria-hidden="true" />{dict.clientProfileOpenContext}</Link> : null}
            <div className="border-t border-[var(--admin-border)] pt-3"><h3 className="font-semibold">{dict.clientProfileProblemHistory}</h3>{history.results.length ? <ul className="mt-2 grid gap-2">{history.results.map((event) => <li key={event.id} className="rounded-xl bg-[var(--admin-surface-muted)] p-3"><span className="font-mono text-xs">{event.event}</span><span className="mt-1 block text-xs text-[var(--admin-text-muted)]">{dateTimeLabel(event.createdAt)}{event.reason ? ` · ${event.reason}` : ""}</span></li>)}</ul> : <p className="mt-2 text-[var(--admin-text-muted)]">{dict.clientProfileNoProblemHistory}</p>}</div>
            {action.resolutionRule === "source_fact_changed" ? <p className="rounded-xl border border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)] p-3">{dict.clientProfileProblemAutomatic}</p> : <label className="grid gap-2 font-semibold">{dict.clientProfileResolutionNote}<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={dict.clientProfileResolutionNotePlaceholder} className="min-h-28 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-3 font-normal" /></label>}
            {error ? <p role="alert" className="text-[var(--admin-danger)]">{error}</p> : null}
          </div>
          {action.resolutionRule === "manual_problem_resolution" ? <DialogFooter><Button disabled={busy} onClick={resolve} className="min-h-11 bg-[var(--admin-ink)] text-[var(--admin-surface)]"><Check className="size-4" aria-hidden="true" />{dict.clientProfileResolveProblem}</Button></DialogFooter> : null}
        </> : null}
      </DialogContent>
    </Dialog>
  );
}

function ActionsList({ actions, onOpen }: { actions: Action[]; onOpen: (action: Action) => void }) {
  if (!actions.length) return <p className="py-4 text-sm text-[var(--admin-text-muted)]">{dict.clientProfileNoUrgentWork}</p>;
  return <div className="grid gap-2">{actions.map((action) => <button key={action.id} type="button" onClick={() => onOpen(action)} className={cn("grid min-h-11 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border p-3 text-left", severityClass(action.severity))}><AlertTriangle className="size-4" aria-hidden="true" /><span className="min-w-0 text-sm font-semibold">{action.description ?? action.causeId}<span className="mt-1 block font-mono text-[0.65rem] font-normal opacity-75">{dateLabel(action.dueAt ?? action.relevantAt)}</span></span><span className="text-xs font-bold">{dict.clientProfileResolve}</span></button>)}</div>;
}

function Organization({ profile }: { profile: Profile }) {
  const groups = [
    [dict.clientProfileBrands, profile.brands.map((item) => item.name)],
    [dict.clientProfileVenueGroups, profile.venueGroups.map((item) => item.name)],
    [dict.clientProfileTags, profile.tags.map((item) => item.kind === "friend" ? dict.clientProfileFriendTag : item.label)],
  ] as const;
  return <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-[var(--admin-border)] p-4"><h3 className="text-xs font-bold tracking-[0.04em] text-[var(--admin-text-muted)] uppercase">{dict.clientProfileLegalEntities}</h3>{profile.legalEntities.length ? <div className="mt-2 grid gap-3">{profile.legalEntities.map((entity) => <div key={entity.id} className="text-sm leading-6"><strong className="block">{entity.name}</strong>{entity.taxId ? <span className="block text-[var(--admin-text-muted)]">{dict.clientProfileTaxId}: {entity.taxId}</span> : null}{entity.registrationNumber ? <span className="block text-[var(--admin-text-muted)]">{dict.clientProfileRegistrationNumber}: {entity.registrationNumber}</span> : null}{entity.address ? <span className="block text-[var(--admin-text-muted)]">{entity.address}</span> : null}</div>)}</div> : <p className="mt-2 text-sm">{dict.clientProfileNoOrganizationData}</p>}</div>{groups.map(([title, items]) => <div key={title} className="rounded-xl border border-[var(--admin-border)] p-4"><h3 className="text-xs font-bold tracking-[0.04em] text-[var(--admin-text-muted)] uppercase">{title}</h3><p className="mt-2 text-sm leading-6">{items.length ? items.join(" · ") : dict.clientProfileNoOrganizationData}</p></div>)}</div>;
}

function HonestEmpty({ icon: Icon, title, body, href, linkLabel }: { icon: typeof CircleDollarSign; title: string; body: string; href?: string; linkLabel?: string }) {
  return <div className="grid min-h-56 place-items-center px-5 py-8 text-center"><div className="max-w-lg"><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[var(--admin-surface-muted)] text-[var(--admin-text-muted)]"><Icon className="size-5" aria-hidden="true" /></span><h2 className="mt-4 text-lg font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-[var(--admin-text-muted)]">{body}</p>{href && linkLabel ? <Link href={href} className="mt-4 inline-flex min-h-11 items-center gap-2 font-semibold underline underline-offset-4">{linkLabel}<ExternalLink className="size-4" aria-hidden="true" /></Link> : null}</div></div>;
}

type VenueService = VenueDetail["services"][number];

function serviceState(service: VenueService) {
  return service.subscription?.status ?? service.profileStatus;
}

function ServiceLink({ service }: { service: VenueService }) {
  const meta = serviceMeta[service.type];
  const Icon = meta.icon;
  const href = service.type === "scanme_links" ? "/admin/usluge/links" : service.type === "google_review" ? "/admin/usluge/review" : "/admin/usluge/meni";
  return <Link href={href} aria-label={`${dict.clientProfileOpenService}: ${meta.label}`} className="flex min-h-11 items-center gap-2 font-semibold underline-offset-4 hover:underline"><Icon className="size-4" aria-hidden="true" />{meta.label}</Link>;
}

function ServiceState({ service }: { service: VenueService }) {
  const state = serviceState(service);
  return <AdminStatus label={stateLabel[state] ?? state} tone={state === "active" ? "active" : state === "suspended" ? "problem" : "waiting"} />;
}

function subscriptionText(service: VenueService) {
  return service.subscription ? `${service.subscription.period === "monthly" ? dict.clientProfileBillingMonthly : dict.clientProfileBillingAnnual} · ${dict.clientProfilePaidThrough} ${dateLabel(service.subscription.paidThrough)}` : dict.clientProfileNoSubscription;
}

const serviceColumns: AdminColumn<VenueService>[] = [
  { id: "service", header: dict.clientProfileServices, rowHeader: true, sortValue: (service) => serviceMeta[service.type].label, cell: (service) => <ServiceLink service={service} /> },
  { id: "state", header: dict.clientProfileVenueStatus, sortValue: (service) => stateLabel[serviceState(service)] ?? serviceState(service), cell: (service) => <ServiceState service={service} /> },
  { id: "subscription", header: dict.clientProfileSubscription, cell: (service) => <span className="text-xs text-[var(--admin-text-muted)]">{subscriptionText(service)}</span> },
];

function ServiceRows({ detail }: { detail: VenueDetail }) {
  if (!detail.services.length) return <p className="text-sm text-[var(--admin-text-muted)]">{dict.clientsServiceAbsent}</p>;
  return (
    <AdminDataView
      listKey="klijent.usluge"
      caption={dict.clientProfileServices}
      rows={detail.services}
      getRowId={(service) => service.profileId}
      columns={serviceColumns}
      renderCard={(service) => <AdminDataCard title={<ServiceLink service={service} />} badges={<ServiceState service={service} />} subtitle={subscriptionText(service)} />}
    />
  );
}

function VenueSection({ venues, detail, selectedId, canLoadMore, loadingMore, onSelect, onLoadMore, onProblem }: { venues: Venue[]; detail: VenueDetail | null | undefined; selectedId?: string; canLoadMore: boolean; loadingMore: boolean; onSelect: (id: string) => void; onLoadMore: () => void; onProblem: (action: Action) => void }) {
  if (!venues.length) return <HonestEmpty icon={Building2} title={dict.clientsColVenues} body={dict.clientProfileNoOrganizationData} />;
  return <div className="grid min-w-0 gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
    <div className="min-w-0"><label className="grid gap-1.5 text-xs font-semibold lg:hidden">{dict.clientProfileVenueSelect}<select className={controlClass} value={selectedId} onChange={(event) => onSelect(event.target.value)}>{venues.map((venue) => <option key={venue.businessId} value={venue.businessId}>{venue.name}</option>)}</select></label><div className="hidden gap-2 lg:grid">{venues.map((venue) => <button type="button" key={venue.businessId} onClick={() => onSelect(venue.businessId)} className={cn("min-h-11 rounded-xl border px-3 py-2 text-left", selectedId === venue.businessId ? "border-[var(--admin-ink)] bg-[var(--admin-surface-muted)]" : "border-[var(--admin-border)]")}><strong className="block truncate text-sm">{venue.name}</strong><span className="font-mono text-[0.65rem] text-[var(--admin-text-muted)]">{venue.smlCode}</span></button>)}</div>{canLoadMore ? <button disabled={loadingMore} type="button" onClick={onLoadMore} className={cn(subtleButton, "mt-3 w-full")}>{dict.clientProfileLoadMoreVenues}</button> : null}</div>
    <div className="min-w-0">{detail === undefined ? <AdminLoadingState compact /> : detail === null ? <HonestEmpty icon={Building2} title={dict.clientProfileVenueDetails} body={dict.clientProfileNoOrganizationData} /> : <div className="grid gap-5"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-semibold">{detail.name}</h2><AdminStatus label={detail.status === "active" ? dict.statusActive : dict.clientProfileArchived} tone={detail.status === "active" ? "active" : "neutral"} /></div><p className="mt-1 font-mono text-xs text-[var(--admin-text-muted)]">{detail.smlCode}</p>{detail.address || detail.city ? <p className="mt-3 flex items-start gap-2 text-sm"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{[detail.address, detail.city].filter(Boolean).join(", ")}</p> : null}<p className="mt-2 text-xs text-[var(--admin-text-muted)]">{[detail.legalEntity?.name, detail.brand?.name, detail.venueGroup?.name].filter(Boolean).join(" · ") || dict.clientProfileNoOrganizationData}</p></div><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-[var(--admin-surface-muted)] p-4"><h3 className="text-xs font-bold uppercase">{dict.clientProfileVenueContact}</h3><p className="mt-2 font-semibold">{detail.effectiveContact.displayName}</p><p className="text-xs text-[var(--admin-text-muted)]">{detail.contactSource === "venue_override" ? dict.clientProfileVenueContactOverride : dict.clientProfileVenueContactAccount}</p></div><div className="rounded-xl bg-[var(--admin-surface-muted)] p-4"><h3 className="text-xs font-bold uppercase">{dict.clientProfileProductsSummary}</h3><p className="mt-2 text-2xl font-semibold">{detail.productCount}</p><p className="text-xs text-[var(--admin-text-muted)]">{dict.clientProfileProductsAtVenue}</p></div></div><div><h3 className="mb-3 font-semibold">{dict.clientProfileServices}</h3><ServiceRows detail={detail} /></div><div><h3 className="mb-3 font-semibold">{dict.clientProfileUrgentWork}</h3><ActionsList actions={detail.openActions} onOpen={onProblem} /></div></div>}</div>
  </div>;
}

function ActivitySection({ rows, canLoadMore, loadingMore, onLoadMore }: { rows: Activity[]; canLoadMore: boolean; loadingMore: boolean; onLoadMore: () => void }) {
  return <div><h2 className="text-lg font-semibold">{dict.clientProfileActivityTitle}</h2>{rows.length ? <ol className="mt-4 grid gap-2">{rows.map((row) => <li key={row.id} className="grid gap-1 rounded-xl border border-[var(--admin-border)] p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><span className="font-mono text-xs font-semibold break-all">{row.action}</span><time className="text-xs text-[var(--admin-text-muted)]">{dateTimeLabel(row.createdAt)}</time></li>)}</ol> : <p className="mt-4 text-sm text-[var(--admin-text-muted)]">{dict.clientProfileActivityEmpty}</p>}{canLoadMore ? <button type="button" disabled={loadingMore} onClick={onLoadMore} className={cn(subtleButton, "mt-4")}>{dict.clientProfileLoadMore}</button> : null}</div>;
}

function OverviewSection({ profile, venues, onProblem }: { profile: Profile; venues: Venue[]; onProblem: (action: Action) => void }) {
  const services = Object.entries(serviceMeta) as Array<[keyof Profile["serviceSummaries"], (typeof serviceMeta)[keyof typeof serviceMeta]]>;
  return <div className="grid gap-6">
    <div><h2 className="mb-3 text-lg font-semibold">{dict.clientProfileUrgentWork}</h2><ActionsList actions={profile.openActions} onOpen={onProblem} /></div>
    <div className="grid gap-4 lg:grid-cols-2">
      <div><div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">{dict.clientProfileSectionVenues}</h2><Link href="?section=venues" className="inline-flex min-h-11 items-center text-xs font-semibold underline underline-offset-4">{dict.clientProfileOpenContext}</Link></div><div className="grid gap-2">{venues.length ? venues.slice(0, 3).map((venue) => <div key={venue.businessId} className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-[var(--admin-border)] px-3"><span className="min-w-0"><strong className="block truncate text-sm">{venue.name}</strong><span className="font-mono text-[0.65rem] text-[var(--admin-text-muted)]">{venue.smlCode}</span></span><span className="shrink-0 text-xs font-semibold">{venue.productCount} {dict.clientProfileProductsAtVenue}</span></div>) : <p className="text-sm text-[var(--admin-text-muted)]">{dict.clientProfileNoOrganizationData}</p>}</div></div>
      <div><h2 className="mb-3 text-lg font-semibold">{dict.clientProfileServices}</h2><div className="grid gap-2">{services.map(([key, meta]) => { const Icon = meta.icon; const summary = profile.serviceSummaries[key]; return <div key={key} className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-[var(--admin-border)] px-3"><span className="flex items-center gap-2 text-sm font-semibold"><Icon className="size-4" aria-hidden="true" />{meta.label}</span><span className="text-xs text-[var(--admin-text-muted)]">{summary.total} · {summary.worst ? stateLabel[summary.worst] : dict.clientsServiceAbsent}</span></div>; })}</div></div>
    </div>
    <div><h2 className="mb-3 text-lg font-semibold">{dict.clientProfileOrganization}</h2><Organization profile={profile} /></div>
  </div>;
}

function CommunicationSection({ contact, profile, live }: { contact: Contact; profile: Profile; live: boolean }) {
  return <div className="grid gap-5"><div className="rounded-xl border border-[var(--admin-border)] p-4"><h2 className="font-semibold">{contact.displayName}</h2><p className="mt-1 text-xs text-[var(--admin-text-muted)]">{contact.positionTitle}</p><div className="mt-3 flex flex-wrap gap-3 text-sm">{contact.email ? <a href={`mailto:${contact.email}`} className="inline-flex min-h-11 items-center gap-2 underline-offset-4 hover:underline"><Mail className="size-4" aria-hidden="true" />{contact.email}</a> : null}{contact.phone ? <a href={`tel:${contact.phone}`} className="inline-flex min-h-11 items-center gap-2 underline-offset-4 hover:underline"><Phone className="size-4" aria-hidden="true" />{contact.phone}</a> : null}</div></div>{live ? <AdminConversationWorkspace accountId={profile.accountId} contactId={contact.id} accountName={profile.accountName} contactName={contact.displayName} embedded /> : <HonestEmpty icon={MessageSquareText} title={dict.clientProfileCommunicationEmptyTitle} body={dict.clientProfileCommunicationEmptyBody} href="/admin/inbox" linkLabel={dict.clientProfileOpenInbox} />}</div>;
}

type ProfileSurfaceProps = {
  profile: Profile;
  venues: Venue[];
  venueDetail: VenueDetail | null | undefined;
  activity: Activity[];
  venuesStatus: string;
  activityStatus: string;
  live: boolean;
  onCreate: (draft: ContactDraft) => Promise<void>;
  onUpdate: (contact: Contact, draft: ContactDraft) => Promise<void>;
  onDefault: (contact: Contact) => Promise<void>;
  onStatus: (contact: Contact) => Promise<void>;
  onResolve: (action: Action, note: string) => Promise<void>;
  onWebsite: (websiteUrl: string | null) => Promise<void>;
  loadVenues: () => void;
  loadActivity: () => void;
};

const venueProductColumns: AdminColumn<Venue>[] = [
  { id: "venue", header: dict.clientProfileColVenue, rowHeader: true, sortValue: (venue) => venue.name, cell: (venue) => <strong className="font-semibold">{venue.name}</strong> },
  { id: "products", header: dict.clientProfileColProducts, align: "end", sortValue: (venue) => venue.productCount, cell: (venue) => <span className="font-semibold tabular-nums">{venue.productCount}</span> },
];

function ProfileSurface(props: ProfileSurfaceProps) {
  const router = useRouter(); const pathname = usePathname(); const params = useSearchParams();
  const requestedSection = params.get("section");
  const section = SECTIONS.some((item) => item.id === requestedSection) ? requestedSection as Section : "overview";
  const requestedContact = params.get("contact");
  const selectedContact = props.profile.contacts.find((contact) => contact.id === requestedContact) ?? props.profile.contacts.find((contact) => contact.isDefault) ?? props.profile.contacts[0];
  const requestedVenue = params.get("venue");
  const selectedVenueId = props.venues.some((venue) => venue.businessId === requestedVenue) ? requestedVenue ?? undefined : props.venues[0]?.businessId;
  const [contactDialog, setContactDialog] = useState<Contact | "new" | null>(null);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [contactDialogVersion, setContactDialogVersion] = useState(0);
  const [confirmStatus, setConfirmStatus] = useState<Contact | null>(null);
  const [confirmStatusOpen, setConfirmStatusOpen] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [actionOpen, setActionOpen] = useState(false);
  const [pending, setPending] = useState(false); const [mutationError, setMutationError] = useState("");
  const returnFocusRef = useRef<HTMLElement | null>(null);
  function rememberDialogFocus() {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  function closeDialog(setOpen: Dispatch<SetStateAction<boolean>>) {
    setOpen(false);
    requestAnimationFrame(() => returnFocusRef.current?.focus());
  }
  function openContactDialog(value: Contact | "new") {
    rememberDialogFocus();
    setContactDialog(value);
    setContactDialogVersion((version) => version + 1);
    setContactDialogOpen(true);
  }
  function openConfirmStatus(contact: Contact) {
    rememberDialogFocus();
    setConfirmStatus(contact);
    setConfirmStatusOpen(true);
  }
  function openProblem(nextAction: Action) {
    rememberDialogFocus();
    setAction(nextAction);
    setActionOpen(true);
  }
  async function run(work: () => Promise<void>, close?: () => void) { setPending(true); setMutationError(""); try { await work(); close?.(); } catch { setMutationError(dict.clientProfileMutationError); } finally { setPending(false); } }
  const content = section === "overview" ? <OverviewSection profile={props.profile} venues={props.venues} onProblem={openProblem} />
    : section === "venues" ? props.venuesStatus === "LoadingFirstPage" ? <AdminLoadingState /> : <VenueSection venues={props.venues} detail={props.venueDetail} selectedId={selectedVenueId} canLoadMore={props.venuesStatus === "CanLoadMore"} loadingMore={props.venuesStatus === "LoadingMore"} onSelect={(id) => updateUrl(router, pathname, params, "venue", id)} onLoadMore={props.loadVenues} onProblem={openProblem} />
      : section === "finance" ? <AdminClientFinanceSummary accountId={props.profile.accountId} preview={!props.live} />
        : section === "communication" ? <CommunicationSection contact={selectedContact} profile={props.profile} live={props.live} />
          : section === "products" ? <div><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">{dict.clientProfileProductsSummary}</h2><Link href="/admin/operativa/proizvodi" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold underline underline-offset-4">{dict.clientProfileOpenProducts}<ExternalLink className="size-4" aria-hidden="true" /></Link></div><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--admin-text-muted)]">{dict.clientProfileProductsBody}</p><AdminDataView
              className="mt-4"
              listKey="klijent.proizvodi"
              caption={dict.clientProfileProductsSummary}
              rows={props.venues}
              getRowId={(venue) => venue.businessId}
              columns={venueProductColumns}
              renderCard={(venue) => <><strong className="block truncate">{venue.name}</strong><span className="mt-2 block text-2xl font-semibold">{venue.productCount}</span><span className="text-xs text-[var(--admin-text-muted)]">{dict.clientProfileProductsAtVenue}</span></>}
            /></div>
            : props.activityStatus === "LoadingFirstPage" ? <AdminLoadingState /> : <ActivitySection rows={props.activity} canLoadMore={props.activityStatus === "CanLoadMore"} loadingMore={props.activityStatus === "LoadingMore"} onLoadMore={props.loadActivity} />;
  return <div className="grid min-w-0 gap-5"><ProfileHeader profile={props.profile} onWebsite={props.onWebsite} /><div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]"><div className="min-w-0 xl:col-start-1 xl:row-start-1"><nav aria-label={dict.clientProfileSectionOverview} className="grid grid-cols-2 gap-1 rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-1 sm:grid-cols-3 xl:grid-cols-6">{SECTIONS.map((item) => <button key={item.id} type="button" aria-current={section === item.id ? "page" : undefined} onClick={() => updateUrl(router, pathname, params, "section", item.id === "overview" ? undefined : item.id)} className={cn("min-h-11 rounded-xl px-2 text-xs font-semibold", section === item.id ? "bg-[var(--admin-ink)] text-[var(--admin-surface)]" : "hover:bg-[var(--admin-surface-muted)]")}>{item.label}</button>)}</nav>{section === "communication" ? <div className="mt-4 min-w-0">{content}</div> : <AdminPanel className="mt-4 min-w-0 overflow-hidden p-4 sm:p-5">{content}</AdminPanel>}</div><aside className="order-first min-w-0 xl:order-none xl:col-start-2 xl:row-start-1"><ContactCard profile={props.profile} selected={selectedContact} onSelect={(id) => updateUrl(router, pathname, params, "contact", id)} onAdd={() => openContactDialog("new")} onEdit={openContactDialog} onDefault={(contact) => run(() => props.onDefault(contact))} onStatus={openConfirmStatus} pending={pending} /></aside></div><ContactDialog key={`${contactDialog === "new" ? "new" : contactDialog?.id ?? "closed"}-${contactDialogVersion}`} open={contactDialogOpen} contact={contactDialog === "new" ? null : contactDialog} busy={pending} error={mutationError} onOpenChange={(open) => open ? setContactDialogOpen(true) : closeDialog(setContactDialogOpen)} onSubmit={(draft) => run(() => contactDialog && contactDialog !== "new" ? props.onUpdate(contactDialog, draft) : props.onCreate(draft), () => closeDialog(setContactDialogOpen))} /><Dialog open={Boolean(confirmStatus) && confirmStatusOpen} onOpenChange={(open) => open ? setConfirmStatusOpen(true) : closeDialog(setConfirmStatusOpen)}><DialogContent className="admin-v1 border-[var(--admin-border)] bg-[var(--admin-surface-strong)]"><DialogHeader><DialogTitle>{confirmStatus?.status === "active" ? dict.clientProfileDeactivateContact : dict.clientProfileReactivateContact}</DialogTitle><DialogDescription>{dict.clientProfileConfirmDeactivate}</DialogDescription></DialogHeader>{mutationError ? <p role="alert" className="text-sm text-[var(--admin-danger)]">{mutationError}</p> : null}<DialogFooter><Button variant="outline" onClick={() => closeDialog(setConfirmStatusOpen)}>{dict.clientProfileCancel}</Button><Button disabled={pending} onClick={() => confirmStatus && run(() => props.onStatus(confirmStatus), () => closeDialog(setConfirmStatusOpen))}>{confirmStatus?.status === "active" ? dict.clientProfileDeactivateContact : dict.clientProfileReactivateContact}</Button></DialogFooter></DialogContent></Dialog><ProblemDialog profile={props.profile} action={action} open={actionOpen} onClose={() => closeDialog(setActionOpen)} onResolve={props.onResolve} live={props.live} /></div>;
}

export function AdminClientProfileWorkspace({ accountId }: { accountId: string }) {
  const profile = useQuery(api.adminClientProfiles.getProfile, { accountId });
  const venuePage = usePaginatedQuery(api.adminClientProfiles.listVenues, profile ? { accountId: profile.accountId } : "skip", { initialNumItems: 12 });
  const params = useSearchParams();
  const selectedVenue = venuePage.results.some((venue) => venue.businessId === params.get("venue")) ? params.get("venue") : venuePage.results[0]?.businessId;
  const venueDetail = useQuery(api.adminClientProfiles.getVenueDetail, profile && selectedVenue ? { accountId: profile.accountId, businessId: selectedVenue } : "skip");
  const activityPage = usePaginatedQuery(api.adminClientProfiles.listActivity, profile ? { accountId: profile.accountId } : "skip", { initialNumItems: 15 });
  const create = useMutation(api.adminClientProfiles.createContact); const update = useMutation(api.adminClientProfiles.updateContact); const setDefault = useMutation(api.adminClientProfiles.setDefaultContact); const setStatus = useMutation(api.adminClientProfiles.setContactStatus); const resolve = useMutation(api.adminClientProfiles.resolveManualProblem); const setWebsite = useMutation(api.adminClientProfiles.setWebsite);
  if (profile === undefined) return <AdminPanel><AdminLoadingState label={dict.loadingLabel} /></AdminPanel>;
  if (profile === null) return <AdminPanel><AdminErrorState title={dict.clientProfileNotFoundTitle} body={dict.clientProfileNotFoundBody} /></AdminPanel>;
  return <ProfileSurface profile={profile} venues={venuePage.results} venueDetail={venueDetail} activity={activityPage.results} venuesStatus={venuePage.status} activityStatus={activityPage.status} live onCreate={async (draft) => { await create({ accountId: profile.accountId, ...draft }); }} onUpdate={async (contact, draft) => { await update({ accountId: profile.accountId, contactId: contact.id, ...draft }); }} onDefault={async (contact) => { await setDefault({ accountId: profile.accountId, contactId: contact.id }); }} onStatus={async (contact) => { await setStatus({ accountId: profile.accountId, contactId: contact.id, status: contact.status === "active" ? "inactive" : "active" }); }} onResolve={async (action, note) => { await resolve({ accountId: profile.accountId, actionItemId: action.id, note }); }} onWebsite={async (websiteUrl) => { await setWebsite({ accountId: profile.accountId, websiteUrl }); }} loadVenues={() => venuePage.loadMore(12)} loadActivity={() => activityPage.loadMore(15)} />;
}

export class AdminClientProfileErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <AdminPanel><AdminErrorState title={dict.clientProfileErrorTitle} body={dict.clientProfileErrorBody} onRetry={() => window.location.reload()} /></AdminPanel> : this.props.children; }
}

const fixtureProfile = {
  accountId: "fixture-account" as Id<"accounts">, accountName: "Bistro Zelen d.o.o.", ownerDisplayName: "Ana Petrović sa veoma dugim poslovnim imenom", smkCode: "SMK-ANA-014", websiteUrl: "https://www.primer.rs/", status: "active", premiumStatus: "grace", premiumWarning: true, venueCount: 2,
  contacts: [
    { id: "fixture-contact-1" as Id<"accountContacts">, firstName: "Ana", lastName: "Petrović", displayName: "Ana Petrović", email: "ana@bistrozelen.rs", phone: "+381641234567", positionTitle: "Vlasnica", isOwner: true, status: "active", isDefault: true },
    { id: "fixture-contact-2" as Id<"accountContacts">, firstName: "Marko", lastName: "Ilić", displayName: "Marko Ilić", email: "marko@bistrozelen.rs", phone: "+381635558011", positionTitle: "Operativa", isOwner: false, status: "active", isDefault: false },
  ], defaultContactId: "fixture-contact-1" as Id<"accountContacts">,
  openActions: [{ id: "fixture-action" as Id<"actionItems">, causeId: "subscription_grace", businessId: "fixture-venue-1" as Id<"businesses">, severity: "warning", description: "Potrebna je provera obnove Menu pretplate.", dueAt: Date.parse("2026-09-15"), relevantAt: Date.parse("2026-09-11"), contextHref: "/admin/usluge", resolutionRule: "source_fact_changed" }], openActionCount: 1, openActionCountCapped: false,
  serviceSummaries: { scanme_links: { total: 2, active: 2, grace: 0, warning: 0, suspended: 0, inactive: 0, problem: 0, worst: "active" }, google_review: { total: 1, active: 1, grace: 0, warning: 0, suspended: 0, inactive: 0, problem: 0, worst: "active" }, scanme_menu: { total: 2, active: 1, grace: 1, warning: 0, suspended: 0, inactive: 0, problem: 0, worst: "grace" } },
  legalEntities: [{ id: "fixture-entity" as Id<"legalEntities">, name: "Bistro Zelen d.o.o.", taxId: "112233445", registrationNumber: "22114455", address: "Cara Dušana 42" }], brands: [{ id: "fixture-brand" as Id<"brands">, name: "Bistro Zelen" }], venueGroups: [], tags: [{ id: "fixture-tag" as Id<"accountTags">, kind: "friend", label: "" }], organizationRowsCapped: false,
} satisfies Profile;

const fixtureVenues: Venue[] = [
  { businessId: "fixture-venue-1" as Id<"businesses">, name: "Bistro Zelen Dorćol", smlCode: "SML-BZE-001", city: "Beograd", status: "active", productCount: 14, signal: { severity: "warning", causeId: "subscription_grace" } },
  { businessId: "fixture-venue-2" as Id<"businesses">, name: "Bistro Zelen Novi Beograd", smlCode: "SML-BZE-002", city: "Beograd", status: "active", productCount: 8, signal: { severity: null, causeId: null } },
];

const fixtureVenueDetail = { businessId: "fixture-venue-1" as Id<"businesses">, name: "Bistro Zelen Dorćol", smlCode: "SML-BZE-001", city: "Beograd", address: "Cara Dušana 42", status: "active", legalEntity: { name: "Bistro Zelen d.o.o.", taxId: "112233445", registrationNumber: "22114455", address: "Cara Dušana 42" }, brand: { name: "Bistro Zelen" }, venueGroup: null, effectiveContact: fixtureProfile.contacts[1], contactSource: "venue_override", productCount: 14, services: [{ profileId: "fixture-service" as Id<"serviceProfiles">, type: "scanme_menu", profileStatus: "active", subscription: { id: "fixture-subscription" as Id<"subscriptions">, period: "annual", status: "grace", warning: true, startsAt: Date.parse("2025-09-15"), paidThrough: Date.parse("2026-09-15"), graceEndsAt: Date.parse("2026-09-22"), nextTransitionAt: Date.parse("2026-09-22"), cancelAtPeriodEnd: false } }], openActions: fixtureProfile.openActions, openActionsCapped: false } satisfies VenueDetail;
const fixtureVenueDetailTwo = { ...fixtureVenueDetail, businessId: "fixture-venue-2" as Id<"businesses">, name: "Bistro Zelen Novi Beograd", smlCode: "SML-BZE-002", address: "Bulevar Zorana Đinđića 64", effectiveContact: fixtureProfile.contacts[0], contactSource: "account" as const, productCount: 8, services: [], openActions: [] } satisfies VenueDetail;

const fixtureActivity: Activity[] = [{ id: "fixture-audit" as Id<"adminAuditLog">, action: "admin_v1_contact_updated", actorUserId: "fixture-admin" as Id<"users">, businessId: null, createdAt: Date.parse("2026-09-11T10:30:00Z") }];

export function AdminClientProfilePreview() {
  const params = useSearchParams();
  const venueDetail = params.get("venue") === String(fixtureVenueDetailTwo.businessId) ? fixtureVenueDetailTwo : fixtureVenueDetail;
  const [profile, setProfile] = useState<Profile>(fixtureProfile);
  return <div className="grid gap-4"><div><span className="rounded-full bg-[var(--admin-accent)] px-2.5 py-1 text-[0.68rem] font-bold text-[var(--admin-accent-ink)]">{dict.clientProfileFixtureBadge}</span><p className="mt-2 text-sm text-[var(--admin-text-muted)]">{dict.clientProfileFixtureDescription}</p></div><ProfileSurface profile={profile} venues={fixtureVenues} venueDetail={venueDetail} activity={fixtureActivity} venuesStatus="Exhausted" activityStatus="Exhausted" live={false} onCreate={async (draft) => setProfile((value) => ({ ...value, contacts: [...value.contacts, { id: `fixture-${value.contacts.length + 1}` as Id<"accountContacts">, ...draft, displayName: `${draft.firstName} ${draft.lastName}`, email: draft.email || null, phone: draft.phone || null, isOwner: false, status: "active", isDefault: false }] }))} onUpdate={async (contact, draft) => setProfile((value) => ({ ...value, contacts: value.contacts.map((item) => item.id === contact.id ? { ...item, ...draft, displayName: `${draft.firstName} ${draft.lastName}`, email: draft.email || null, phone: draft.phone || null } : item) }))} onDefault={async (contact) => setProfile((value) => ({ ...value, defaultContactId: contact.id, contacts: value.contacts.map((item) => ({ ...item, isDefault: item.id === contact.id })) }))} onStatus={async (contact) => setProfile((value) => ({ ...value, contacts: value.contacts.map((item) => item.id === contact.id ? { ...item, status: item.status === "active" ? "inactive" : "active" } : item) }))} onResolve={async (action) => setProfile((value) => ({ ...value, openActions: value.openActions.filter((item) => item.id !== action.id), openActionCount: Math.max(0, value.openActionCount - 1) }))} onWebsite={async (websiteUrl) => setProfile((value) => ({ ...value, websiteUrl }))} loadVenues={() => undefined} loadActivity={() => undefined} /></div>;
}
