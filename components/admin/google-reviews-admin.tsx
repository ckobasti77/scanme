"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Copy, ExternalLink, LoaderCircle, MapPin, Pencil, Plus, RefreshCw, Save, ShieldOff, UserRoundPlus } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AdminGuard } from "./admin-guard";
import { AdminShell } from "./admin-shell";

const dateFormatter = new Intl.DateTimeFormat("sr-Latn-RS", { dateStyle: "medium", timeStyle: "short" });
const shortDate = new Intl.DateTimeFormat("sr-Latn-RS", { day: "2-digit", month: "2-digit" });

const invitationLabels: Record<string, string> = {
  queued: "Čeka slanje",
  sent: "Poslata",
  accepted: "Prihvaćena",
  failed: "Slanje nije uspelo",
  revoked: "Opozvana",
  expired: "Istekla",
};

type BusinessList = FunctionReturnType<typeof api.admin.listBusinesses>;
type BusinessMetrics = FunctionReturnType<typeof api.admin.getBusinessMetrics>;

export function GoogleReviewsAdmin() {
  return (
    <AdminGuard>
      <AdminShell><GoogleReviewsWorkspace /></AdminShell>
    </AdminGuard>
  );
}

function GoogleReviewsWorkspace() {
  const businesses = useQuery(api.admin.listBusinesses);
  const [selectedId, setSelectedId] = useState<Id<"businesses"> | null>(null);
  const effectiveSelectedId = selectedId ?? businesses?.[0]?.id ?? null;
  const selected = businesses?.find((business) => business.id === effectiveSelectedId) ?? null;
  const metrics = useQuery(api.admin.getBusinessMetrics, effectiveSelectedId ? { businessId: effectiveSelectedId } : "skip");
  const createBusiness = useMutation(api.admin.createBusiness);
  const updateBusinessName = useMutation(api.admin.updateBusinessName);
  const updateDestination = useMutation(api.admin.updateDestination);
  const setBusinessActive = useMutation(api.admin.setBusinessActive);
  const resendInvitation = useMutation(api.admin.resendInvitation);
  const revokeInvitation = useMutation(api.admin.revokeInvitation);
  const replaceContact = useMutation(api.admin.replaceContact);
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function feedback(success?: string) {
    setMessage(success ?? null);
    setError(null);
  }

  function fail(reason: unknown) {
    setMessage(null);
    setError(reason instanceof Error ? reason.message : "Operacija nije uspela.");
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setPending("create");
    try {
      const result = await createBusiness({
        name: String(data.get("name") ?? ""),
        slug: String(data.get("slug") ?? ""),
        destinationUrl: String(data.get("destinationUrl") ?? ""),
        firstName: String(data.get("firstName") ?? ""),
        lastName: String(data.get("lastName") ?? ""),
        email: String(data.get("email") ?? ""),
        phone: String(data.get("phone") ?? ""),
        positionTitle: String(data.get("positionTitle") ?? ""),
      });
      form.reset();
      setSelectedId(result.businessId);
      feedback("Lokal je sačuvan. Pozivnica je stavljena u red za slanje.");
    } catch (reason) { fail(reason); } finally { setPending(null); }
  }

  async function submitDestination(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected?.link) return;
    const data = new FormData(event.currentTarget);
    setPending("destination");
    try {
      await updateDestination({ linkId: selected.link.id, destinationUrl: String(data.get("destinationUrl") ?? "") });
      feedback("Dinamička destinacija je promenjena. Sledeći sken koristi novi link.");
    } catch (reason) { fail(reason); } finally { setPending(null); }
  }

  async function submitBusinessName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setPending("name");
    try {
      await updateBusinessName({
        businessId: selected.id,
        name: String(data.get("businessName") ?? ""),
      });
      form.closest("details")?.removeAttribute("open");
      feedback("Naziv lokala je promenjen. QR slug i adrese ostali su isti.");
    } catch (reason) { fail(reason); } finally { setPending(null); }
  }

  async function toggleActive() {
    if (!selected) return;
    const nextActive = selected.status === "inactive";
    if (!nextActive && !window.confirm("Deaktivirati lokal i zaustaviti QR preusmeravanje?")) return;
    setPending("active");
    try {
      await setBusinessActive({ businessId: selected.id, active: nextActive });
      feedback(nextActive ? "Lokal je ponovo aktivan." : "Lokal i QR preusmeravanje su deaktivirani.");
    } catch (reason) { fail(reason); } finally { setPending(null); }
  }

  async function resend() {
    if (!selected?.invitation) return;
    setPending("invite");
    try {
      await resendInvitation({ invitationId: selected.invitation.id });
      feedback("Nova pozivnica je kreirana i stavljena u red za slanje.");
    } catch (reason) { fail(reason); } finally { setPending(null); }
  }

  async function revoke() {
    if (!selected?.invitation || !window.confirm("Opozvati ovu pozivnicu? Link iz emaila više neće raditi.")) return;
    setPending("invite");
    try {
      await revokeInvitation({ invitationId: selected.invitation.id });
      feedback("Pozivnica je opozvana.");
    } catch (reason) { fail(reason); } finally { setPending(null); }
  }

  async function submitContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setPending("contact");
    try {
      await replaceContact({
        businessId: selected.id,
        firstName: String(data.get("firstName") ?? ""),
        lastName: String(data.get("lastName") ?? ""),
        email: String(data.get("email") ?? ""),
        phone: String(data.get("phone") ?? ""),
        positionTitle: String(data.get("positionTitle") ?? ""),
      });
      form.reset();
      feedback("Stari POC pristup je isključen, a nova pozivnica je kreirana.");
    } catch (reason) { fail(reason); } finally { setPending(null); }
  }

  return (
    <>
      <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Google Review kartice</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">Lokali i QR metrika</h1>
        </div>
        <details className="group relative">
          <summary className="button-primary list-none"><Plus className="size-4" /> Dodaj lokal</summary>
          <div className="mt-4 border border-border bg-card p-5 sm:absolute sm:right-0 sm:z-10 sm:w-[680px] sm:max-w-[90vw]">
            <CreateBusinessForm pending={pending === "create"} onSubmit={submitCreate} />
          </div>
        </details>
      </div>

      {message ? <p role="status" className="mt-5 border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary">{message}</p> : null}
      {error ? <p role="alert" className="mt-5 border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p> : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside aria-label="Lista lokala" className="border border-border bg-card">
          <div className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Lokali ({businesses?.length ?? 0})</div>
          {businesses === undefined ? <div className="h-28 animate-pulse bg-secondary" /> : businesses.length ? (
            <div className="max-h-[70dvh] overflow-y-auto">
              {businesses.map((business) => (
                <button key={business.id} type="button" onClick={() => { setSelectedId(business.id); feedback(); }} className={`block min-h-20 w-full border-b border-border px-4 py-4 text-left transition-colors ${effectiveSelectedId === business.id ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}>
                  <span className="block font-semibold">{business.name}</span>
                  <span className={`mt-1 block text-xs ${effectiveSelectedId === business.id ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{business.link?.slug ?? "Nema QR linka"} · {business.link?.scanCount ?? 0} skenova</span>
                </button>
              ))}
            </div>
          ) : <div className="p-6 text-sm leading-6 text-muted-foreground">Još nema lokala. Dodajte prvi lokal i POC kontakt.</div>}
        </aside>

        <section className="min-w-0">
          {selected ? (
            <div className="grid gap-6">
              <div className="border border-border bg-card p-5 sm:p-7">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex items-center gap-3"><MapPin className="size-5 text-primary" /><h2 className="text-2xl font-semibold tracking-[-0.04em]">{selected.name}</h2></div>
                    <p className="mt-2 text-sm text-muted-foreground">/{selected.link?.slug}</p>
                    <details className="mt-4">
                      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground">
                        <Pencil className="size-4 text-primary" /> Promeni naziv lokala
                      </summary>
                      <form key={selected.id} onSubmit={submitBusinessName} className="mt-3 grid gap-3 sm:grid-cols-[minmax(220px,1fr)_auto] sm:items-end">
                        <div className="form-field">
                          <Label htmlFor={`business-name-${selected.id}`}>Novi naziv *</Label>
                          <Input id={`business-name-${selected.id}`} name="businessName" defaultValue={selected.name} required minLength={2} maxLength={120} className="form-control h-11" />
                        </div>
                        <Button type="submit" disabled={pending === "name"}>
                          {pending === "name" ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
                          Sačuvaj naziv
                        </Button>
                      </form>
                    </details>
                  </div>
                  <Button variant={selected.status === "inactive" ? "default" : "destructive"} onClick={toggleActive} disabled={pending === "active"}>
                    {pending === "active" ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldOff className="size-4" />}
                    {selected.status === "inactive" ? "Aktiviraj" : "Deaktiviraj"}
                  </Button>
                </div>
                <MetricStrip metrics={metrics} />
              </div>

              {selected.link ? (
                <div className="grid gap-6 xl:grid-cols-2">
                  <form onSubmit={submitDestination} className="border border-border bg-card p-5 sm:p-7">
                    <h3 className="font-semibold">Dinamička destinacija</h3>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">Promena se primenjuje na sledeći sken. Odštampani QR ostaje isti.</p>
                    <div className="form-field mt-6"><Label htmlFor="destination-url">HTTPS URL *</Label><Input id="destination-url" name="destinationUrl" type="url" defaultValue={selected.link.destinationUrl} required className="form-control h-12" /></div>
                    <Button type="submit" className="mt-5" disabled={pending === "destination"}>{pending === "destination" ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />} Sačuvaj link</Button>
                  </form>
                  <div className="border border-border bg-card p-5 sm:p-7">
                    <h3 className="font-semibold">Stabilne adrese</h3>
                    <div className="mt-6 grid gap-3">
                      <LinkRow label="QR adresa" path={`/s/${selected.link.slug}`} />
                      <LinkRow label="Klijentski panel" path={`/s/${selected.link.slug}/client-panel`} />
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-6 xl:grid-cols-2">
                <ContactPanel selected={selected} pending={pending} onResend={resend} onRevoke={revoke} onReplace={submitContact} />
                <RecentScans metrics={metrics} />
              </div>
            </div>
          ) : <div className="border border-border bg-card p-10 text-sm text-muted-foreground">Izaberite lokal da biste videli podatke.</div>}
        </section>
      </div>
    </>
  );
}

function MetricStrip({ metrics }: { metrics: BusinessMetrics | undefined }) {
  if (metrics === undefined) return <div className="mt-7 h-24 animate-pulse bg-secondary" />;
  const values = [
    ["Ukupno", metrics?.total ?? 0],
    ["Danas", metrics?.today ?? 0],
    ["Poslednjih 7 dana", metrics?.last7Days ?? 0],
  ];
  return <dl className="mt-7 grid border border-border sm:grid-cols-3">{values.map(([label, value], index) => <div key={String(label)} className={`p-4 sm:p-5 ${index ? "border-t border-border sm:border-l sm:border-t-0" : ""}`}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-3 text-3xl font-semibold tabular-nums text-primary">{value}</dd></div>)}</dl>;
}

function CreateBusinessForm({ pending, onSubmit }: { pending: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <form onSubmit={onSubmit}>
      <h2 className="text-xl font-semibold">Novi lokal</h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field name="name" label="Naziv lokala" /><Field name="slug" label="QR slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="zova-review" />
        <div className="sm:col-span-2"><Field name="destinationUrl" label="Google Review / Dynamic Link" type="url" /></div>
        <Field name="firstName" label="POC ime" /><Field name="lastName" label="POC prezime" />
        <Field name="email" label="POC email" type="email" /><Field name="phone" label="Telefon" type="tel" />
        <div className="sm:col-span-2"><Field name="positionTitle" label="Uloga u lokalu" placeholder="Vlasnik, menadžer..." /></div>
      </div>
      <Button type="submit" className="mt-5" disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />} Sačuvaj lokal i pošalji poziv</Button>
    </form>
  );
}

function Field({ name, label, type = "text", placeholder, pattern }: { name: string; label: string; type?: string; placeholder?: string; pattern?: string }) {
  return <div className="form-field"><Label htmlFor={`field-${name}`}>{label} *</Label><Input id={`field-${name}`} name={name} type={type} placeholder={placeholder} pattern={pattern} required className="form-control h-11" /></div>;
}

function LinkRow({ label, path }: { label: string; path: string }) {
  const [copied, setCopied] = useState(false);
  const fullUrl = typeof window === "undefined" ? path : `${window.location.origin}${path}`;
  async function copy() { await navigator.clipboard.writeText(fullUrl); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
  return <div className="grid gap-2 border border-border p-3"><span className="text-xs text-muted-foreground">{label}</span><code className="break-all text-xs">{path}</code><div className="flex gap-2"><Button type="button" size="sm" variant="outline" onClick={() => void copy()}><Copy className="size-3.5" /> {copied ? "Kopirano" : "Kopiraj"}</Button><Button size="sm" variant="outline" asChild><a href={path} target="_blank" rel="noreferrer"><ExternalLink className="size-3.5" /> Otvori</a></Button></div></div>;
}

function ContactPanel({ selected, pending, onResend, onRevoke, onReplace }: { selected: BusinessList[number]; pending: string | null; onResend: () => void; onRevoke: () => void; onReplace: (event: FormEvent<HTMLFormElement>) => void }) {
  const invite = selected.invitation;
  return <div className="border border-border bg-card p-5 sm:p-7"><h3 className="font-semibold">POC pristup</h3>{selected.contact ? <dl className="mt-5 grid gap-3 text-sm"><div><dt className="text-xs text-muted-foreground">Kontakt</dt><dd className="mt-1">{selected.contact.firstName} {selected.contact.lastName}</dd></div><div><dt className="text-xs text-muted-foreground">Email i telefon</dt><dd className="mt-1 break-all">{selected.contact.email}<br />{selected.contact.phone}</dd></div><div><dt className="text-xs text-muted-foreground">Uloga</dt><dd className="mt-1">{selected.contact.positionTitle}</dd></div><div><dt className="text-xs text-muted-foreground">Pozivnica</dt><dd className="mt-1">{invite ? invitationLabels[invite.status] ?? invite.status : "Nije kreirana"}</dd>{invite?.failureReason ? <p className="mt-2 text-xs leading-5 text-destructive">{invite.failureReason}</p> : null}</div></dl> : <p className="mt-4 text-sm text-muted-foreground">POC nije dodat.</p>}
    {invite && invite.status !== "accepted" ? <div className="mt-5 flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={onResend} disabled={pending === "invite"}><RefreshCw className="size-4" /> Pošalji novu</Button>{invite.status !== "revoked" ? <Button type="button" variant="destructive" onClick={onRevoke} disabled={pending === "invite"}>Opozovi</Button> : null}</div> : null}
    <details className="mt-6 border-t border-border pt-5"><summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold"><UserRoundPlus className="size-4 text-primary" /> Zameni POC kontakt</summary><form onSubmit={onReplace} className="mt-4 grid gap-3 sm:grid-cols-2"><Field name="firstName" label="Ime" /><Field name="lastName" label="Prezime" /><Field name="email" label="Email" type="email" /><Field name="phone" label="Telefon" type="tel" /><div className="sm:col-span-2"><Field name="positionTitle" label="Uloga" /></div><Button type="submit" className="sm:col-span-2" disabled={pending === "contact"}>{pending === "contact" ? <LoaderCircle className="size-4 animate-spin" /> : null} Zameni kontakt i pošalji poziv</Button></form></details>
  </div>;
}

function RecentScans({ metrics }: { metrics: BusinessMetrics | undefined }) {
  const max = useMemo(() => Math.max(1, ...(metrics?.daily.map((row) => row.count) ?? [1])), [metrics]);
  return <div className="border border-border bg-card p-5 sm:p-7"><h3 className="font-semibold">Poslednjih 7 dana</h3>{metrics === undefined ? <div className="mt-5 h-32 animate-pulse bg-secondary" /> : <><div className="mt-6 grid h-36 grid-cols-7 items-end gap-2" role="img" aria-label="Broj skeniranja po danu">{metrics?.daily.map((row) => <div key={row.dateKey} className="grid h-full grid-rows-[1fr_auto] gap-2"><div className="flex items-end"><div className="w-full bg-primary" style={{ height: `${Math.max(3, row.count / max * 100)}%` }} title={`${row.dateKey}: ${row.count}`} /></div><span className="text-center text-[10px] text-muted-foreground">{shortDate.format(new Date(`${row.dateKey}T12:00:00`))}</span></div>)}</div><h4 className="mt-8 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Nedavni skenovi</h4>{metrics?.recent.length ? <ol className="mt-3 grid gap-2">{metrics.recent.slice(0, 6).map((scan) => <li key={scan.id} className="flex items-center justify-between gap-3 border border-border px-3 py-2 text-xs"><span>{scan.deviceCategory}</span><time className="text-muted-foreground">{dateFormatter.format(new Date(scan.scannedAt))}</time></li>)}</ol> : <p className="mt-3 text-sm text-muted-foreground">Još nema skeniranja za ovaj lokal.</p>}</>}</div>;
}
