"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Archive, ArrowDown, ArrowUp, Copy, ExternalLink, ListFilter, LoaderCircle, MapPin, Pencil, Plus, RefreshCw, Save, ShieldOff, Trash2, UserRoundPlus } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { MetricsBarChart } from "@/components/metrics-bar-chart";
import { MetricsPeriodSelect } from "@/components/metrics-period-select";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useRetainedQueryResult } from "@/lib/use-retained-query-result";
import { AdminGuard } from "./admin-guard";
import { AdminShell } from "./admin-shell";

const dateFormatter = new Intl.DateTimeFormat("sr-Latn-RS", { dateStyle: "medium", timeStyle: "short" });

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
type ContactRecord = NonNullable<BusinessList[number]["contact"]>;
type InvitationId = NonNullable<ContactRecord["invitation"]>["id"];

const slugFormatMessage = "Format: mala slova a-z, cifre 0-9 i pojedinačne crtice između reči, bez razmaka ili crtice na početku/kraju (npr. naziv-lokala), najviše 80 karaktera.";
const emailFormatMessage = "Unesite email u formatu ime@domen.rs.";
const phoneFormatMessage = "Unesite 7–15 cifara; dozvoljeni su početni +, razmak, zagrade i crtica.";
const roleOptions = ["Vlasnik", "Menadžer", "Radnik"] as const;

type ContactValues = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  positionTitle: string;
};

type ContactDraft = ContactValues & {
  id: number;
  roleChoice: (typeof roleOptions)[number] | "custom" | "";
  customRole: string;
};

type CreateBusinessValues = {
  name: string;
  slug: string;
  destinationUrl: string;
  contacts: ContactValues[];
};

type BusinessSort = "name" | "scans" | "status";
type SortDirection = "asc" | "desc";
type MetricsRange = "7d" | "30d" | "90d" | "1y" | "all";

function emptyContact(id: number): ContactDraft {
  return { id, firstName: "", lastName: "", email: "", phone: "", positionTitle: "", roleChoice: "", customRole: "" };
}

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
  const [showArchived, setShowArchived] = useState(false);
  const [businessSort, setBusinessSort] = useState<BusinessSort>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const visibleBusinesses = useMemo(() => {
    const visible = (businesses ?? []).filter((business) => Boolean(business.archivedAt) === showArchived);
    return [...visible].sort((first, second) => {
      const direction = sortDirection === "asc" ? 1 : -1;
      const byName = first.name.localeCompare(second.name, "sr-Latn", { sensitivity: "base" });
      const firstInactive = first.status === "inactive" ? 1 : 0;
      const secondInactive = second.status === "inactive" ? 1 : 0;

      if (businessSort !== "status" && firstInactive !== secondInactive) {
        return firstInactive - secondInactive;
      }
      if (businessSort === "name") return byName * direction;
      const firstScans = first.link?.scanCount ?? 0;
      const secondScans = second.link?.scanCount ?? 0;
      if (businessSort === "scans") return (firstScans - secondScans) * direction || byName;
      return (firstInactive - secondInactive) * direction || byName;
    });
  }, [businesses, businessSort, showArchived, sortDirection]);
  const effectiveSelectedId = visibleBusinesses.some((business) => business.id === selectedId)
    ? selectedId
    : visibleBusinesses[0]?.id ?? null;
  const selected = visibleBusinesses.find((business) => business.id === effectiveSelectedId) ?? null;
  const [graphRange, setGraphRange] = useState<MetricsRange>("7d");
  const [summaryRange, setSummaryRange] = useState<MetricsRange>("7d");
  const metricsQuery = useQuery(api.admin.getBusinessMetrics, effectiveSelectedId ? { businessId: effectiveSelectedId, range: graphRange, summaryRange } : "skip");
  const metrics = useRetainedQueryResult(metricsQuery, effectiveSelectedId);
  const createBusiness = useMutation(api.admin.createBusiness);
  const updateBusinessName = useMutation(api.admin.updateBusinessName);
  const updateBusinessSlug = useMutation(api.admin.updateBusinessSlug);
  const updateDestination = useMutation(api.admin.updateDestination);
  const setBusinessActive = useMutation(api.admin.setBusinessActive);
  const archiveBusiness = useMutation(api.admin.archiveBusiness);
  const resendInvitation = useMutation(api.admin.resendInvitation);
  const revokeInvitation = useMutation(api.admin.revokeInvitation);
  const addContact = useMutation(api.admin.addContact);
  const updateContact = useMutation(api.admin.updateContact);
  const deleteContact = useMutation(api.admin.deleteContact);
  const replaceContact = useMutation(api.admin.replaceContact);
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);

  function feedback(success?: string) {
    setMessage(success ?? null);
    setError(null);
  }

  function fail(reason: unknown) {
    setMessage(null);
    setError(reason instanceof Error ? reason.message : "Operacija nije uspela.");
  }

  async function submitCreate(values: CreateBusinessValues) {
    setPending("create");
    try {
      const result = await createBusiness({
        name: values.name,
        slug: values.slug,
        destinationUrl: values.destinationUrl,
        contacts: values.contacts,
      });
      setSelectedId(result.businessId);
      feedback("Lokal je sačuvan. Email pozivnice nije poslat automatski.");
      return true;
    } catch (reason) { fail(reason); return false; } finally { setPending(null); }
  }

  async function submitDestination(destinationUrl: string) {
    if (!selected?.link) return;
    setPending("destination");
    try {
      await updateDestination({ linkId: selected.link.id, destinationUrl });
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

  async function saveSlug(kind: "qr" | "clientPanel", slug: string) {
    if (!selected?.link) return false;
    const pendingKey = `slug:${kind}`;
    setPending(pendingKey);
    try {
      await updateBusinessSlug({ businessId: selected.id, linkId: selected.link.id, kind, slug });
      feedback(
        kind === "qr"
          ? "QR adresa je promenjena. Stara odštampana QR adresa nastavlja da radi."
          : "Adresa klijentskog panela je promenjena.",
      );
      return true;
    } catch (reason) {
      fail(reason);
      return false;
    } finally {
      setPending(null);
    }
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

  async function archiveSelectedBusiness() {
    if (!selected || selected.status !== "inactive" || selected.archivedAt) return;
    setPending("archive");
    try {
      await archiveBusiness({ businessId: selected.id });
      setArchiveDialogOpen(false);
      feedback("Lokal je prebačen u arhivirane lokale. Svi podaci su sačuvani.");
    } catch (reason) {
      fail(reason);
    } finally {
      setPending(null);
    }
  }

  async function resend(invitationId: InvitationId) {
    setPending("invite");
    try {
      await resendInvitation({ invitationId });
      feedback("Nova pozivnica je kreirana i stavljena u red za slanje.");
    } catch (reason) { fail(reason); } finally { setPending(null); }
  }

  async function revoke(invitationId: InvitationId) {
    if (!window.confirm("Opozvati ovu pozivnicu? Link iz emaila više neće raditi.")) return;
    setPending("invite");
    try {
      await revokeInvitation({ invitationId });
      feedback("Pozivnica je opozvana.");
    } catch (reason) { fail(reason); } finally { setPending(null); }
  }

  async function submitContact(values: ContactValues, mode: "edit" | "replace" | "add", contactId?: ContactRecord["id"]) {
    if (!selected) return false;
    const pendingKey = `contact:${mode}`;
    setPending(pendingKey);
    try {
      if (mode === "edit") {
        if (!contactId) return false;
        const result = await updateContact({ businessId: selected.id, contactId, ...values });
        feedback(result.invitationId ? "POC kontakt je izmenjen. Pozivnica je pripremljena, ali email nije poslat automatski." : "POC kontakt je izmenjen. Status pozivnice nije promenjen.");
      } else if (mode === "replace") {
        const result = await replaceContact({ businessId: selected.id, ...values });
        feedback(result.invitationId ? "POC kontakt je zamenjen, a pozivnica je pripremljena bez automatskog slanja emaila." : "POC kontakt je zamenjen. Email i pozivnica mogu se dodati kasnije.");
      } else {
        await addContact({ businessId: selected.id, ...values });
        feedback("Novi POC kontakt je sačuvan. Email pozivnice nije poslat automatski.");
      }
      return true;
    } catch (reason) {
      fail(reason);
      return false;
    } finally {
      setPending(null);
    }
  }

  async function removeContact(contactId: ContactRecord["id"]) {
    if (!selected || !window.confirm("Obrisati ovaj dodatni POC kontakt?")) return;
    setPending("contact:delete");
    try {
      await deleteContact({ businessId: selected.id, contactId });
      feedback("Dodatni POC kontakt je obrisan.");
    } catch (reason) {
      fail(reason);
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Google Review kartice</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">Lokali i QR metrika</h1>
        </div>
        <CreateBusinessPopover pending={pending === "create"} onSubmit={submitCreate} />
      </div>

      {message ? <p role="status" className="mt-5 border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary">{message}</p> : null}
      {error ? <p role="alert" className="mt-5 border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p> : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside aria-label="Lista lokala" className="border border-border bg-card">
          <div className="grid gap-3 border-b border-border px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Lokali ({visibleBusinesses.length})</span>
              <button
                type="button"
                role="switch"
                aria-checked={showArchived}
                aria-label={showArchived ? "Prikaži aktuelne lokale" : "Prikaži arhivirane lokale"}
                title={showArchived ? "Prikaži aktuelne lokale" : "Prikaži arhivirane lokale"}
                onClick={() => { setShowArchived((current) => !current); feedback(); }}
                className={`inline-flex min-h-11 items-center gap-2 border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${showArchived ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
              >
                <Archive className={`size-4 ${showArchived ? "fill-current" : ""}`} />
                Arhiva
              </button>
            </div>
            <div className="flex items-stretch border border-border bg-background">
              <Select value={businessSort} onValueChange={(value) => setBusinessSort(value as BusinessSort)}>
                <SelectTrigger className="h-11 min-w-0 flex-1 justify-start gap-0 rounded-none border-0 border-r border-border bg-secondary/35 px-3 text-left shadow-none focus-visible:ring-inset [&>svg]:ml-auto" aria-label="Vrsta sortiranja lokala">
                  <span className="!flex min-w-0 flex-1 items-center gap-3">
                    <ListFilter className="size-4 shrink-0 text-primary" />
                    <span className="min-w-0 truncate font-medium"><SelectValue /></span>
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Naziv</SelectItem>
                  <SelectItem value="scans">Skenovi</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                </SelectContent>
              </Select>
              <button
                type="button"
                onClick={() => setSortDirection((current) => current === "asc" ? "desc" : "asc")}
                aria-label={sortDirection === "asc" ? "Rastući redosled. Promeni u opadajući." : "Opadajući redosled. Promeni u rastući."}
                title={sortDirection === "asc" ? "Rastući redosled" : "Opadajući redosled"}
                className="group flex h-11 w-12 shrink-0 cursor-pointer items-center justify-center transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span className="flex items-center gap-0.5" aria-hidden="true">
                  <ArrowUp className={`size-4 transition-colors ${sortDirection === "asc" ? "text-primary" : "text-muted-foreground/45 group-hover:text-muted-foreground"}`} />
                  <ArrowDown className={`size-4 transition-colors ${sortDirection === "desc" ? "text-primary" : "text-muted-foreground/45 group-hover:text-muted-foreground"}`} />
                </span>
              </button>
            </div>
          </div>
          {businesses === undefined ? <div className="h-28 animate-pulse bg-secondary" /> : visibleBusinesses.length ? (
            <div className="max-h-[70dvh] overflow-y-auto">
              {visibleBusinesses.map((business) => {
                const isSelected = effectiveSelectedId === business.id;
                const isInactive = business.status === "inactive";
                const isArchived = Boolean(business.archivedAt);
                const stateClasses = isInactive
                  ? `bg-destructive text-destructive-foreground hover:bg-destructive/90 ${isSelected ? "ring-2 ring-inset ring-background/70" : ""}`
                  : isSelected
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-secondary";
                return (
                  <button
                    key={business.id}
                    type="button"
                    aria-current={isSelected ? "true" : undefined}
                    onClick={() => { setSelectedId(business.id); feedback(); }}
                    className={`block min-h-20 w-full border-b border-border px-4 py-4 text-left transition-colors focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${stateClasses}`}
                  >
                    <span className="flex items-center gap-2 font-semibold">
                      {isArchived ? <Archive className="size-4 fill-current" /> : isInactive ? <ShieldOff className="size-4" /> : null}
                      {business.name}
                    </span>
                    <span className={`mt-1 block text-xs ${isInactive || isSelected ? "text-current/70" : "text-muted-foreground"}`}>
                      {business.link?.slug ?? "Nema QR linka"} · {business.link?.scanCount ?? 0} skenova{isArchived ? " · Arhiviran" : isInactive ? " · Deaktiviran" : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : <div className="p-6 text-sm leading-6 text-muted-foreground">{showArchived ? "Nema arhiviranih lokala." : "Još nema aktuelnih lokala. Dodajte prvi lokal i POC kontakt."}</div>}
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
                  {selected.archivedAt ? (
                    <div className="inline-flex min-h-11 items-center gap-2 border border-destructive bg-destructive px-4 text-sm font-semibold text-destructive-foreground">
                      <Archive className="size-4 fill-current" /> Arhiviran
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      <Button variant={selected.status === "inactive" ? "default" : "destructive"} onClick={toggleActive} disabled={pending === "active"}>
                        {pending === "active" ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldOff className="size-4" />}
                        {selected.status === "inactive" ? "Aktiviraj" : "Deaktiviraj"}
                      </Button>
                      {selected.status === "inactive" ? (
                        <Dialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
                          <DialogTrigger asChild>
                            <Button type="button" size="sm" variant="destructive" disabled={pending === "archive"}>
                              <Trash2 className="size-3.5" /> Delete
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="rounded-none border-border bg-card shadow-none" showCloseButton={pending !== "archive"}>
                            <DialogHeader>
                              <DialogTitle>Da li ste sigurni da zelite da obrisete lokal</DialogTitle>
                              <DialogDescription>
                                Lokal će biti prebačen u arhivirane lokale. Sve informacije, kontakti, linkovi i metrike ostaće sačuvani.
                              </DialogDescription>
                            </DialogHeader>
                            <DialogFooter>
                              <DialogClose asChild>
                                <Button type="button" variant="outline" disabled={pending === "archive"}>Otkaži</Button>
                              </DialogClose>
                              <Button type="button" variant="destructive" disabled={pending === "archive"} onClick={() => void archiveSelectedBusiness()}>
                                {pending === "archive" ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                                Obriši lokal
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      ) : null}
                    </div>
                  )}
                </div>
                <MetricStrip metrics={metrics} range={summaryRange} onRangeChange={setSummaryRange} />
              </div>

              {selected.link ? (
                <div className="grid gap-6 xl:grid-cols-2">
                  <DestinationForm
                    key={`${selected.id}-${selected.link.id}-${selected.link.destinationUrl}`}
                    initialValue={selected.link.destinationUrl}
                    pending={pending === "destination"}
                    onSubmit={submitDestination}
                  />
                  <div className="border border-border bg-card p-5 sm:p-7">
                    <h3 className="font-semibold">Stabilne adrese</h3>
                    <div className="mt-6 grid gap-3">
                      <LinkRow
                        key={`qr-${selected.id}-${selected.link.slug}`}
                        label="QR adresa"
                        path={`/${selected.link.slug}`}
                        slug={selected.link.slug}
                        pending={pending === "slug:qr"}
                        onSave={(slug) => saveSlug("qr", slug)}
                        preservesPreviousAddress
                      />
                      <LinkRow
                        key={`client-panel-${selected.id}-${selected.clientPanelSlug}`}
                        label="Klijentski panel"
                        path={`/${selected.clientPanelSlug}/client-panel`}
                        slug={selected.clientPanelSlug}
                        pending={pending === "slug:clientPanel"}
                        onSave={(slug) => saveSlug("clientPanel", slug)}
                        invitationWarning
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-6 xl:grid-cols-2">
                <ContactPanel
                  key={selected.id}
                  selected={selected}
                  pending={pending}
                  onResend={resend}
                  onRevoke={revoke}
                  onEdit={(values, contactId) => submitContact(values, "edit", contactId)}
                  onReplace={(values) => submitContact(values, "replace")}
                  onAdd={(values) => submitContact(values, "add")}
                  onDelete={removeContact}
                />
                <RecentScans metrics={metrics} range={graphRange} onRangeChange={setGraphRange} />
              </div>
            </div>
          ) : <div className="border border-border bg-card p-10 text-sm text-muted-foreground">Izaberite lokal da biste videli podatke.</div>}
        </section>
      </div>
    </>
  );
}

function MetricStrip({ metrics, range, onRangeChange }: { metrics: BusinessMetrics | undefined; range: MetricsRange; onRangeChange: (range: MetricsRange) => void }) {
  if (metrics === undefined) return <div className="mt-7 h-24 animate-pulse bg-secondary" />;
  return (
    <dl className="mt-7 grid border border-border sm:grid-cols-3">
      <div className="p-4 sm:p-5"><dt className="text-xs text-muted-foreground">Ukupno</dt><dd className="mt-3 text-3xl font-semibold tabular-nums text-primary">{metrics?.total ?? 0}</dd></div>
      <div className="border-t border-border p-4 sm:border-l sm:border-t-0 sm:p-5"><dt className="text-xs text-muted-foreground">Danas</dt><dd className="mt-3 text-3xl font-semibold tabular-nums text-primary">{metrics?.today ?? 0}</dd></div>
      <div className="border-t border-border p-4 sm:border-l sm:border-t-0 sm:p-5">
        <dt><MetricsPeriodSelect value={range} onChange={onRangeChange} ariaLabel="Period prikazane metrike" /></dt>
        <dd className="mt-3 text-3xl font-semibold tabular-nums text-primary">{metrics?.summaryPeriodTotal ?? metrics?.periodTotal ?? metrics?.last7Days ?? 0}</dd>
      </div>
    </dl>
  );
}

function DestinationForm({ initialValue, pending, onSubmit }: { initialValue: string; pending: boolean; onSubmit: (value: string) => Promise<void> }) {
  const [value, setValue] = useState(initialValue);
  const changed = value.trim() !== initialValue.trim();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!changed) return;
    await onSubmit(value.trim());
  }

  return (
    <form onSubmit={submit} className="border border-border bg-card p-5 sm:p-7">
      <h3 className="font-semibold">Dinamička destinacija</h3>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">Promena se primenjuje na sledeći sken. Odštampani QR ostaje isti.</p>
      <div className="form-field mt-6"><Label htmlFor="destination-url">HTTPS URL *</Label><Input id="destination-url" name="destinationUrl" type="url" value={value} onChange={(event) => setValue(event.target.value)} required className="form-control h-12" /></div>
      <Button type="submit" className="mt-5" disabled={pending || !changed} title={changed ? "Sačuvaj izmenjeni link" : "Link nije promenjen"}>
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />} Sačuvaj link
      </Button>
    </form>
  );
}

function CreateBusinessPopover({ pending, onSubmit }: { pending: boolean; onSubmit: (values: CreateBusinessValues) => Promise<boolean> }) {
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

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/đ/g, "dj")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function isValidEmail(value: string) {
  return value.trim().length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidPhone(value: string) {
  const phone = value.trim();
  const digitCount = (phone.match(/\d/g) ?? []).length;
  return digitCount >= 7 && digitCount <= 15 && /^\+?[0-9\s().-]+$/.test(phone);
}

function isValidDestination(value: string) {
  if (!value.trim()) return true;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function validateContactValues(values: ContactValues, required: boolean) {
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

function InputField({ id, label, value, onChange, onBlur, error, type = "text", placeholder, required = false, autoComplete }: {
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

function RoleField({ id, value, customValue, onChange, onCustomChange, onBlur, error, required = false }: {
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

function CreateBusinessForm({ pending, onSubmit }: { pending: boolean; onSubmit: (values: CreateBusinessValues) => Promise<boolean> }) {
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
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(values.slug.trim()) || values.slug.trim().length > 80) nextErrors.slug = slugFormatMessage;
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

function LinkRow({
  label,
  path,
  slug,
  pending,
  onSave,
  invitationWarning = false,
  preservesPreviousAddress = false,
}: {
  label: string;
  path: string;
  slug: string;
  pending: boolean;
  onSave: (slug: string) => Promise<boolean>;
  invitationWarning?: boolean;
  preservesPreviousAddress?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const fullUrl = typeof window === "undefined" ? path : `${window.location.origin}${path}`;
  async function copy() { await navigator.clipboard.writeText(fullUrl); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (await onSave(String(data.get("slug") ?? ""))) setEditing(false);
  }
  const descriptionId = `slug-description-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="grid gap-2 border border-border p-3 sm:p-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <code className="break-all text-sm">{path}</code>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => void copy()}>
          <Copy className="size-3.5" /> {copied ? "Kopirano" : "Kopiraj"}
        </Button>
        <Button size="sm" variant="outline" className="min-h-11" asChild>
          <a href={path} target="_blank" rel="noreferrer"><ExternalLink className="size-3.5" /> Otvori</a>
        </Button>
        <Button
          type="button"
          size="sm"
          className="ml-auto min-h-11"
          aria-expanded={editing}
          onClick={() => setEditing((current) => !current)}
        >
          <Pencil className="size-3.5" /> Izmeni
        </Button>
      </div>
      {editing ? (
        <form onSubmit={submit} className="mt-2 border-t border-border pt-4">
          <div className="form-field">
            <Label htmlFor={`slug-${descriptionId}`}>Novi slug *</Label>
            <Input
              id={`slug-${descriptionId}`}
              name="slug"
              defaultValue={slug}
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              maxLength={80}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-describedby={descriptionId}
              required
              autoFocus
              className="form-control h-11"
            />
            <p id={descriptionId} className="text-xs leading-5 text-muted-foreground">
              {`Koristite mala slova, brojeve i crtice. ${
                preservesPreviousAddress
                  ? "Prethodne odštampane QR adrese nastavljaju da rade."
                  : "Promenom stara adresa prestaje da radi."
              }`}
              {invitationWarning ? " Ako postoji aktivna pozivnica, pošaljite novu." : ""}
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? <LoaderCircle className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              Sačuvaj
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setEditing(false)}>
              Otkaži
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

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

function ContactPanel({ selected, pending, onResend, onRevoke, onEdit, onReplace, onAdd, onDelete }: {
  selected: BusinessList[number];
  pending: string | null;
  onResend: (invitationId: InvitationId) => void;
  onRevoke: (invitationId: InvitationId) => void;
  onEdit: (values: ContactValues, contactId: ContactRecord["id"]) => Promise<boolean>;
  onReplace: (values: ContactValues) => Promise<boolean>;
  onAdd: (values: ContactValues) => Promise<boolean>;
  onDelete: (contactId: ContactRecord["id"]) => void;
}) {
  const [mode, setMode] = useState<"edit" | "replace" | "add" | null>(null);
  const [activeContactId, setActiveContactId] = useState<ContactRecord["id"] | null>(selected.contact?.id ?? null);
  const contacts = selected.contacts ?? (selected.contact ? [selected.contact] : []);
  const primaryContactId = selected.contact?.id ?? null;
  const activeContact = contacts.find((candidate) => candidate.id === activeContactId) ?? selected.contact;
  const activeInvitation = activeContact?.invitation ?? null;
  const isPrimary = activeContact?.id === primaryContactId;

  function chooseContact(value: string) {
    setActiveContactId(value as ContactRecord["id"]);
    setMode(null);
  }

  return (
    <div className="border border-border bg-card p-5 sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <h3 className="font-semibold">POC pristup</h3>
        {contacts.length ? (
          <div className="grid gap-2 sm:justify-items-end">
            <label htmlFor="choose-poc" className="text-xs text-muted-foreground">Choose POC</label>
            <Select value={activeContact?.id ?? ""} onValueChange={chooseContact}>
              <SelectTrigger id="choose-poc" className="h-11 w-full sm:w-56" aria-label="Choose POC">
                <SelectValue placeholder="Choose POC" />
              </SelectTrigger>
              <SelectContent>
                {contacts.map((candidate) => (
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

function RecentScans({ metrics, range, onRangeChange }: { metrics: BusinessMetrics | undefined; range: MetricsRange; onRangeChange: (range: MetricsRange) => void }) {
  return (
    <div className="min-w-0 border border-border bg-card p-5 sm:p-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="font-semibold">{metrics?.rangeLabel ?? "Poslednjih 7 dana"}</h3>
        <Select value={range} onValueChange={(value) => onRangeChange(value as MetricsRange)} disabled={metrics === undefined}>
          <SelectTrigger className="h-10 w-full sm:w-44" aria-label="Period skenova">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">7 dana</SelectItem>
            <SelectItem value="30d">30 dana</SelectItem>
            <SelectItem value="90d">3 meseca</SelectItem>
            <SelectItem value="1y">1 godina</SelectItem>
            <SelectItem value="all">Oduvek</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {metrics === undefined ? <div className="mt-5 h-32 animate-pulse bg-secondary" /> : <>
        <MetricsBarChart
          rows={metrics?.daily ?? []}
          rangeLabel={metrics?.rangeLabel ?? "Izabrani period"}
          heightClassName="h-36"
          barMinWidth={36}
          variant={metrics?.range === "all" ? "line" : "bars"}
        />
        <h4 className="mt-8 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Nedavni skenovi</h4>
        {metrics?.recent.length ? <ol className="mt-3 grid gap-2">{metrics.recent.slice(0, 6).map((scan) => <li key={scan.id} className="flex items-center justify-between gap-3 border border-border px-3 py-2 text-xs"><span>{scan.deviceCategory}</span><time className="text-muted-foreground">{dateFormatter.format(new Date(scan.scannedAt))}</time></li>)}</ol> : <p className="mt-3 text-sm text-muted-foreground">Još nema skeniranja za ovaj lokal.</p>}
      </>}
    </div>
  );
}
