"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  ExternalLink,
  ListFilter,
  LoaderCircle,
  MapPin,
  Pencil,
  Plus,
  Save,
  Send,
  ShieldOff,
  Trash2,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { MetricsBarChart } from "@/components/metrics-bar-chart";
import { MetricsPeriodSelect } from "@/components/metrics-period-select";
import { ScanMeLinksTemplate } from "@/components/scanme-links/templates/registry";
import type { ScanMeLinksViewModel } from "@/components/scanme-links/templates/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AdminGuard } from "./admin-guard";
import { AdminShell } from "./admin-shell";

type EditorData = NonNullable<
  FunctionReturnType<typeof api.scanMeLinks.editor>
>;
type MetricsRange = "7d" | "30d" | "90d" | "1y" | "all";
type BusinessSort = "name" | "scans" | "status";
type SortDirection = "asc" | "desc";

const numberFormatter = new Intl.NumberFormat("sr-Latn-RS");
const percentFormatter = new Intl.NumberFormat("sr-Latn-RS", {
  style: "percent",
  maximumFractionDigits: 1,
});

export function ScanMeLinksAdmin() {
  return (
    <AdminGuard>
      <AdminShell>
        <ScanMeLinksWorkspace />
      </AdminShell>
    </AdminGuard>
  );
}

function ScanMeLinksWorkspace() {
  const businesses = useQuery(api.scanMeLinks.listBusinesses);
  const requests = useQuery(api.activationRequests.list);
  const archiveBusiness = useMutation(api.admin.archiveBusiness);
  const [selectedId, setSelectedId] = useState<Id<"businesses"> | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [sort, setSort] = useState<BusinessSort>("name");
  const [direction, setDirection] = useState<SortDirection>("asc");
  const [createOpen, setCreateOpen] = useState(false);

  const visibleBusinesses = useMemo(() => {
    const visible = (businesses ?? []).filter(
      (business) => Boolean(business.archivedAt) === showArchived,
    );
    return [...visible].sort((first, second) => {
      const multiplier = direction === "asc" ? 1 : -1;
      const byName = first.name.localeCompare(second.name, "sr-Latn", {
        sensitivity: "base",
      });
      const firstInactive = first.profile?.status === "active" ? 0 : 1;
      const secondInactive = second.profile?.status === "active" ? 0 : 1;
      if (sort !== "status" && firstInactive !== secondInactive) {
        return firstInactive - secondInactive;
      }
      if (sort === "name") return byName * multiplier;
      if (sort === "scans") {
        return (
          ((first.profile?.totalScans ?? 0) -
            (second.profile?.totalScans ?? 0)) *
            multiplier || byName
        );
      }
      return (firstInactive - secondInactive) * multiplier || byName;
    });
  }, [businesses, direction, showArchived, sort]);

  const effectiveSelectedId = visibleBusinesses.some(
    (business) => business.id === selectedId,
  )
    ? selectedId
    : visibleBusinesses[0]?.id ?? null;
  const selected =
    visibleBusinesses.find((business) => business.id === effectiveSelectedId) ??
    null;

  async function archiveSelected() {
    if (!selected || selected.profile?.status === "active") return;
    try {
      await archiveBusiness({ businessId: selected.id });
      toast.success("Lokal je prebačen u arhivu. Svi podaci su sačuvani.");
    } catch (error) {
      toast.error(errorMessage(error, "Lokal nije arhiviran."));
    }
  }

  return (
    <>
      <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            ScanMe Links
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">
            Lokali i njihove link stranice
          </h1>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" /> Dodaj lokal
        </Button>
      </div>

      <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside
          aria-label="Lista lokala"
          className="min-w-0 border border-border bg-card"
        >
          <div className="grid gap-3 border-b border-border px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Lokali ({visibleBusinesses.length})
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={showArchived}
                onClick={() => setShowArchived((current) => !current)}
                className={`inline-flex min-h-11 items-center gap-2 border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  showArchived
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <Archive
                  className={`size-4 ${showArchived ? "fill-current" : ""}`}
                />
                Arhiva
              </button>
            </div>
            <div className="flex items-stretch border border-border bg-background">
              <Select
                value={sort}
                onValueChange={(value) => setSort(value as BusinessSort)}
              >
                <SelectTrigger
                  className="h-11 min-w-0 flex-1 rounded-none border-0 border-r border-border bg-secondary/35"
                  aria-label="Vrsta sortiranja lokala"
                >
                  <ListFilter className="size-4 text-primary" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Naziv</SelectItem>
                  <SelectItem value="scans">Skenovi</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                </SelectContent>
              </Select>
              <button
                type="button"
                onClick={() =>
                  setDirection((current) =>
                    current === "asc" ? "desc" : "asc",
                  )
                }
                aria-label={
                  direction === "asc"
                    ? "Rastući redosled. Promeni u opadajući."
                    : "Opadajući redosled. Promeni u rastući."
                }
                className="group flex h-11 w-12 shrink-0 items-center justify-center transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <ArrowUp
                  className={`size-4 ${
                    direction === "asc"
                      ? "text-primary"
                      : "text-muted-foreground/45"
                  }`}
                />
                <ArrowDown
                  className={`size-4 ${
                    direction === "desc"
                      ? "text-primary"
                      : "text-muted-foreground/45"
                  }`}
                />
              </button>
            </div>
          </div>

          {businesses === undefined ? (
            <div className="h-28 animate-pulse bg-secondary" />
          ) : visibleBusinesses.length ? (
            <div className="max-h-[70dvh] overflow-y-auto">
              {visibleBusinesses.map((business) => {
                const isSelected = business.id === effectiveSelectedId;
                const isInactive = business.profile?.status !== "active";
                const isArchived = Boolean(business.archivedAt);
                const stateClasses = isInactive
                  ? `bg-destructive text-destructive-foreground hover:bg-destructive/90 ${
                      isSelected ? "ring-2 ring-inset ring-background/70" : ""
                    }`
                  : isSelected
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-secondary";
                return (
                  <button
                    key={business.id}
                    type="button"
                    aria-current={isSelected ? "true" : undefined}
                    onClick={() => setSelectedId(business.id)}
                    className={`block min-h-20 w-full border-b border-border px-4 py-4 text-left transition-colors focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${stateClasses}`}
                  >
                    <span className="flex items-center gap-2 font-semibold">
                      {isArchived ? (
                        <Archive className="size-4 fill-current" />
                      ) : isInactive ? (
                        <ShieldOff className="size-4" />
                      ) : null}
                      {business.name}
                    </span>
                    <span
                      className={`mt-1 block text-xs ${
                        isInactive || isSelected
                          ? "text-current/70"
                          : "text-muted-foreground"
                      }`}
                    >
                      /{business.profile?.slug ?? "nema-profila"} ·{" "}
                      {business.profile?.totalScans ?? 0} skenova
                      {isArchived
                        ? " · Arhiviran"
                        : isInactive
                          ? " · Neaktivno"
                          : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-6 text-sm leading-6 text-muted-foreground">
              {showArchived
                ? "Nema arhiviranih lokala."
                : "Još nema aktuelnih lokala. Dodajte prvi lokal i POC kontakt."}
            </div>
          )}
        </aside>

        <section className="min-w-0">
          {selected ? (
            <BusinessWorkspace
              businessId={selected.id}
              onArchive={() => void archiveSelected()}
            />
          ) : (
            <div className="border border-border bg-card p-10 text-sm text-muted-foreground">
              Izaberite lokal da biste videli podatke.
            </div>
          )}
        </section>
      </div>

      <ActivationRequests requests={requests ?? []} />
      <CreateBusinessDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(businessId) => setSelectedId(businessId)}
      />
    </>
  );
}

function BusinessWorkspace({
  businessId,
  onArchive,
}: {
  businessId: Id<"businesses">;
  onArchive: () => void;
}) {
  const data = useQuery(api.scanMeLinks.editor, { businessId });
  const [range, setRange] = useState<MetricsRange>("30d");
  const metrics = useQuery(api.scanMeLinks.metrics, { businessId, range });
  const updateBusinessName = useMutation(api.admin.updateBusinessName);
  const setServiceActive = useMutation(api.scanMeLinks.setServiceActive);
  const publishDraft = useMutation(api.scanMeLinks.publishDraft);
  const [pending, setPending] = useState(false);
  const [renamePending, setRenamePending] = useState(false);
  const [renameFeedback, setRenameFeedback] = useState<{
    businessId: Id<"businesses">;
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);

  if (data === undefined) {
    return <div className="h-[560px] animate-pulse bg-muted" />;
  }
  if (!data?.profile || !data.config) {
    return (
      <div className="border border-destructive/30 bg-destructive/5 p-6">
        ScanMe Links profil nije pripremljen. Pokrenite razvojnu migraciju.
      </div>
    );
  }

  const preview = (data.publishedView ?? data.draftView) as
    | ScanMeLinksViewModel
    | null;
  const showingPublished = Boolean(data.publishedView);

  async function toggleActive() {
    setPending(true);
    try {
      await setServiceActive({
        serviceProfileId: data!.profile!.id,
        active: data!.profile!.status !== "active",
      });
      toast.success(
        data!.profile!.status === "active"
          ? "Servis je deaktiviran."
          : "Servis je aktiviran.",
      );
    } catch (error) {
      toast.error(errorMessage(error, "Status nije promenjen."));
    } finally {
      setPending(false);
    }
  }

  async function publish() {
    setPending(true);
    try {
      await publishDraft({
        serviceProfileId: data!.profile!.id,
        expectedDraftRevision: data!.config!.draftRevision,
      });
      setPublishOpen(false);
      toast.success("ScanMe Links stranica je objavljena.");
    } catch (error) {
      toast.error(errorMessage(error, "Izmene nisu objavljene."));
    } finally {
      setPending(false);
    }
  }

  async function submitBusinessName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setRenameFeedback(null);
    setRenamePending(true);
    try {
      await updateBusinessName({
        businessId: data!.id,
        name: String(values.get("businessName") ?? ""),
      });
      form.closest("details")?.removeAttribute("open");
      setRenameFeedback({
        businessId: data!.id,
        tone: "success",
        message: "Naziv lokala i obe kanonske adrese su promenjeni.",
      });
      toast.success("Naziv lokala i njegove adrese su promenjeni.");
    } catch (error) {
      const message = errorMessage(error, "Naziv lokala nije promenjen.");
      setRenameFeedback({ businessId: data!.id, tone: "error", message });
      toast.error(message);
    } finally {
      setRenamePending(false);
    }
  }

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
      <div className="min-w-0 border border-border bg-card p-5 sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <MapPin className="size-5 text-primary" />
              <h2 className="text-2xl font-semibold tracking-[-0.04em]">
                {data.name}
              </h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              /{data.profile.slug}
            </p>
            <details className="mt-4">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground">
                <Pencil className="size-4 text-primary" /> Promeni naziv lokala
              </summary>
              <form
                key={data.id}
                onSubmit={submitBusinessName}
                className="mt-3 grid gap-3 sm:grid-cols-[minmax(220px,1fr)_auto] sm:items-end"
              >
                <div className="grid gap-2">
                  <Label htmlFor={`business-name-${data.id}`}>Novi naziv *</Label>
                  <Input
                    id={`business-name-${data.id}`}
                    name="businessName"
                    defaultValue={data.name}
                    required
                    minLength={2}
                    maxLength={120}
                    className="h-11"
                  />
                </div>
                <Button type="submit" disabled={renamePending}>
                  {renamePending ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  Sačuvaj naziv
                </Button>
              </form>
            </details>
            {renameFeedback?.businessId === data.id ? (
              <p
                role={renameFeedback.tone === "error" ? "alert" : "status"}
                className={`mt-3 text-sm ${
                  renameFeedback.tone === "error"
                    ? "text-destructive"
                    : "text-primary"
                }`}
              >
                {renameFeedback.message}
              </p>
            ) : null}
          </div>
          {data.archivedAt ? (
            <div className="inline-flex min-h-11 items-center gap-2 border border-destructive bg-destructive px-4 text-sm font-semibold text-destructive-foreground">
              <Archive className="size-4 fill-current" /> Arhiviran
            </div>
          ) : (
            <div className="grid gap-2">
              <Button
                variant={
                  data.profile.status === "active" ? "destructive" : "default"
                }
                onClick={() => void toggleActive()}
                disabled={pending}
              >
                {pending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <ShieldOff className="size-4" />
                )}
                {data.profile.status === "active" ? "Deaktiviraj" : "Aktiviraj"}
              </Button>
              {data.profile.status !== "active" ? (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="destructive">
                      <Trash2 className="size-3.5" /> Obriši lokal
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Arhivirati ovaj lokal?</DialogTitle>
                      <DialogDescription>
                        Lokal će biti prebačen u arhivu. Linkovi, kontakti i
                        metrika ostaju sačuvani.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button variant="outline">Otkaži</Button>
                      </DialogClose>
                      <Button variant="destructive" onClick={onArchive}>
                        Arhiviraj
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              ) : null}
            </div>
          )}
        </div>
        <MetricStrip data={metrics} />
      </div>

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="min-w-0 border border-border bg-card p-5 sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="font-semibold">ScanMe Links stranica</h3>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {showingPublished
                  ? "Preview prikazuje trenutno objavljenu verziju."
                  : "Još nema objavljene verzije. Preview prikazuje nacrt."}
              </p>
            </div>
            <span
              className={`inline-flex min-h-8 items-center border px-3 text-xs font-semibold ${
                showingPublished
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300"
              }`}
            >
              {showingPublished ? "Objavljeno" : "Nacrt"}
            </span>
          </div>

          {data.config.hasUnpublishedChanges ? (
            <div className="mt-5 border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
              Nacrt ima neobjavljene izmene. Posetioci ih još ne vide.
            </div>
          ) : null}

          <div className="mt-6 grid gap-3">
            <div className="border border-border bg-background p-4">
              <p className="text-xs text-muted-foreground">Javna adresa</p>
              <p className="mt-2 break-all text-sm font-semibold">
                /{data.profile.slug}
              </p>
            </div>
            <div className="border border-border bg-background p-4">
              <p className="text-xs text-muted-foreground">Klijentski panel</p>
              <p className="mt-2 break-all text-sm font-semibold">
                /{data.clientPanelSlug}/client-panel
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button asChild>
              <Link
                href={`/admin/scanme-links/${data.clientPanelSlug}/editor`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Pencil className="size-4" />
                Uredi ScanMe Links stranicu
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link
                href={`/${data.profile.slug}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="size-4" />
                Otvori javnu stranicu
              </Link>
            </Button>
            {data.config.hasUnpublishedChanges ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setPublishOpen(true)}
              >
                <Send className="size-4" /> Objavi nacrt
              </Button>
            ) : null}
          </div>
        </section>

        <aside className="min-w-0 border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-muted-foreground">
              MOBILNI PREVIEW
            </p>
            <span className="text-xs text-muted-foreground">
              {showingPublished ? "Objavljeno" : "Nacrt"}
            </span>
          </div>
          <div className="relative mx-auto h-[452px] w-[252px] overflow-hidden rounded-[1.8rem] border-[7px] border-foreground/90 bg-foreground/90">
            {preview ? (
              <div className="absolute left-0 top-0 w-[360px] origin-top-left scale-[0.66]">
                <ScanMeLinksTemplate view={preview} preview />
              </div>
            ) : (
              <div className="grid h-full place-items-center bg-background p-6 text-center text-sm text-muted-foreground">
                Preview nije dostupan.
              </div>
            )}
          </div>
        </aside>
      </div>

      <SharedBusinessDetails key={`shared-${data.id}`} data={data} />

      {metrics ? (
        <section className="border border-border bg-card p-5 sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.03em]">
                Metrika
              </h2>
              <p className="mt-2 text-xs text-muted-foreground">
                ScanMe Links skenovi, prikazi i klikovi.
              </p>
            </div>
            <MetricsPeriodSelect
              value={range}
              onChange={setRange}
              ariaLabel="Period prikazane ScanMe Links metrike"
            />
          </div>
          <MetricsBarChart
            rows={metrics.daily}
            rangeLabel={metrics.rangeLabel}
            heightClassName="mt-6 h-56"
            showCounts
            barMinWidth={38}
          />
        </section>
      ) : null}

      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Da li želite da objavite izmene?</DialogTitle>
            <DialogDescription>
              Nova verzija će odmah postati vidljiva posetiocima.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={pending}>
                Otkaži
              </Button>
            </DialogClose>
            <Button onClick={() => void publish()} disabled={pending}>
              {pending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Objavi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetricStrip({
  data,
}: {
  data: FunctionReturnType<typeof api.scanMeLinks.metrics> | undefined;
}) {
  if (data === undefined) {
    return <div className="mt-7 h-24 animate-pulse bg-secondary" />;
  }
  return (
    <dl className="mt-7 grid border border-border sm:grid-cols-3">
      <Metric label="Ukupno skenova" value={data?.totalScans ?? 0} />
      <Metric label="Prikazi stranice" value={data?.totalPageViews ?? 0} />
      <Metric
        label="CTR"
        value={percentFormatter.format(data?.ctr ?? 0)}
        formatted
      />
    </dl>
  );
}

function Metric({
  label,
  value,
  formatted = false,
}: {
  label: string;
  value: number | string;
  formatted?: boolean;
}) {
  return (
    <div className="border-t border-border p-4 first:border-t-0 sm:border-l sm:border-t-0 sm:first:border-l-0 sm:p-5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-3 text-3xl font-semibold tabular-nums text-primary">
        {formatted ? value : numberFormatter.format(Number(value))}
      </dd>
    </div>
  );
}

function SharedBusinessDetails({ data }: { data: EditorData }) {
  const updateContact = useMutation(api.admin.updateContact);
  const addContact = useMutation(api.admin.addContact);
  const generateUploadUrl = useMutation(api.scanMeLinks.generateLogoUploadUrl);
  const updateBusinessLogo = useMutation(api.scanMeLinks.updateBusinessLogo);
  const [logoUrl, setLogoUrl] = useState(data.businessLogoUrl);
  const [contact, setContact] = useState({
    firstName: data.contact?.firstName ?? "",
    lastName: data.contact?.lastName ?? "",
    email: data.contact?.email ?? "",
    phone: data.contact?.phone ?? "",
    positionTitle: data.contact?.positionTitle ?? "",
  });
  const [pending, setPending] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  async function uploadSharedLogo(file: File | undefined) {
    if (!file) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      toast.error("Logo mora biti PNG, JPEG ili WebP fajl do 5 MB.");
      return;
    }
    setUploadingLogo(true);
    try {
      const uploadUrl = await generateUploadUrl({});
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) throw new Error("Logo nije otpremljen.");
      const { storageId } = (await response.json()) as {
        storageId: Id<"_storage">;
      };
      await updateBusinessLogo({
        businessId: data.id,
        logoStorageId: storageId,
      });
      setLogoUrl(URL.createObjectURL(file));
      toast.success("Zajednički logo lokala je sačuvan.");
    } catch (error) {
      toast.error(errorMessage(error, "Logo nije otpremljen."));
    } finally {
      setUploadingLogo(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      if (contact.firstName.trim() && contact.lastName.trim()) {
        if (data.contact) {
          await updateContact({
            businessId: data.id,
            contactId: data.contact.id,
            ...contact,
          });
        } else {
          await addContact({ businessId: data.id, ...contact });
        }
      }
      toast.success("Zajednički podaci lokala su sačuvani.");
    } catch (error) {
      toast.error(errorMessage(error, "Podaci nisu sačuvani."));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="border border-border bg-card p-5 sm:p-7"
    >
      <h2 className="text-lg font-semibold">Zajednički podaci lokala</h2>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        Logo i POC koriste oba servisa i klijentski panel.
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="grid gap-3 sm:col-span-2">
          <Label htmlFor={`shared-logo-${data.id}`}>
            Zajednički logo lokala
          </Label>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="grid size-16 shrink-0 place-items-center overflow-hidden border border-border bg-muted">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" className="size-full object-contain p-2" />
              ) : (
                <span className="text-xs text-muted-foreground">Bez loga</span>
              )}
            </div>
            <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 border border-dashed border-border px-4 text-sm transition-colors hover:border-primary focus-within:ring-2 focus-within:ring-ring">
              {uploadingLogo ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              {uploadingLogo ? "Otpremanje..." : "Promeni zajednički logo"}
              <input
                id={`shared-logo-${data.id}`}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                disabled={uploadingLogo}
                onChange={(event) =>
                  void uploadSharedLogo(event.target.files?.[0])
                }
              />
            </label>
          </div>
        </div>
        <ContactInput
          id={`poc-first-${data.id}`}
          label="POC ime"
          value={contact.firstName}
          onChange={(firstName) =>
            setContact((current) => ({ ...current, firstName }))
          }
        />
        <ContactInput
          id={`poc-last-${data.id}`}
          label="POC prezime"
          value={contact.lastName}
          onChange={(lastName) =>
            setContact((current) => ({ ...current, lastName }))
          }
        />
        <ContactInput
          id={`poc-email-${data.id}`}
          label="POC email"
          type="email"
          value={contact.email}
          onChange={(email) =>
            setContact((current) => ({ ...current, email }))
          }
        />
        <ContactInput
          id={`poc-phone-${data.id}`}
          label="POC telefon"
          type="tel"
          value={contact.phone}
          onChange={(phone) =>
            setContact((current) => ({ ...current, phone }))
          }
        />
        <div className="sm:col-span-2">
          <ContactInput
            id={`poc-role-${data.id}`}
            label="POC uloga"
            value={contact.positionTitle}
            onChange={(positionTitle) =>
              setContact((current) => ({ ...current, positionTitle }))
            }
          />
        </div>
      </div>
      <Button type="submit" className="mt-5" disabled={pending}>
        {pending ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : (
          <Save className="size-4" />
        )}
        Sačuvaj zajedničke podatke
      </Button>
    </form>
  );
}

function ContactInput({
  id,
  label,
  value,
  type = "text",
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  type?: "text" | "email" | "tel";
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function CreateBusinessDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (businessId: Id<"businesses">) => void;
}) {
  const createBusiness = useMutation(api.admin.createBusiness);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    try {
      const result = await createBusiness({
        name: String(form.get("name") ?? ""),
        destinationUrl: "",
        firstName: String(form.get("firstName") ?? ""),
        lastName: String(form.get("lastName") ?? ""),
        email: String(form.get("email") ?? ""),
        phone: String(form.get("phone") ?? ""),
        positionTitle: String(form.get("positionTitle") ?? ""),
      });
      onCreated(result.businessId);
      onOpenChange(false);
      toast.success("Lokal je kreiran sa oba neaktivna servisa.");
    } catch (error) {
      toast.error(errorMessage(error, "Lokal nije kreiran."));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dodaj lokal</DialogTitle>
          <DialogDescription>
            Kreiraćemo neaktivne ScanMe Links i Google Review servise.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-5">
          <div className="grid gap-2">
            <Label htmlFor="new-business-name">Naziv lokala</Label>
            <Input id="new-business-name" name="name" required minLength={2} />
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            ScanMe Links i Google Review adrese biće automatski izvedene iz
            naziva lokala.
          </p>
          <fieldset className="grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
            <legend className="px-2 text-sm font-semibold">POC, opciono</legend>
            <ContactCreateInput id="new-poc-first" name="firstName" label="Ime" />
            <ContactCreateInput
              id="new-poc-last"
              name="lastName"
              label="Prezime"
            />
            <ContactCreateInput
              id="new-poc-email"
              name="email"
              label="Email"
              type="email"
            />
            <ContactCreateInput
              id="new-poc-phone"
              name="phone"
              label="Telefon"
              type="tel"
            />
            <div className="sm:col-span-2">
              <ContactCreateInput
                id="new-poc-role"
                name="positionTitle"
                label="Uloga"
              />
            </div>
          </fieldset>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Otkaži
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Kreiraj lokal
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ContactCreateInput({
  id,
  name,
  label,
  type = "text",
}: {
  id: string;
  name: string;
  label: string;
  type?: "text" | "email" | "tel";
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={name} type={type} />
    </div>
  );
}

function ActivationRequests({
  requests,
}: {
  requests: Array<{
    id: Id<"serviceActivationRequests">;
    businessName: string;
    requestedService: "scanme_links" | "google_review";
    status: "new" | "contacted" | "closed";
    requestedAt: number;
    emailStatus: "queued" | "sent" | "failed";
    contact: { name: string; email: string; phone: string } | null;
  }>;
}) {
  const setStatus = useMutation(api.activationRequests.setStatus);
  if (!requests.length) return null;
  return (
    <section className="mt-8 border border-border bg-card p-5 sm:p-7">
      <h2 className="text-xl font-semibold tracking-[-0.03em]">
        Upiti za aktivaciju
      </h2>
      <div className="mt-5 grid gap-3">
        {requests.map((request) => (
          <article
            key={request.id}
            className="grid gap-4 border border-border p-4 lg:grid-cols-[1fr_auto] lg:items-center"
          >
            <div>
              <p className="font-semibold">{request.businessName}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {request.requestedService === "scanme_links"
                  ? "ScanMe Links"
                  : "Google Review"}{" "}
                ·{" "}
                {new Intl.DateTimeFormat("sr-Latn-RS", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(request.requestedAt)}
              </p>
              {request.contact ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {request.contact.name} ·{" "}
                  {request.contact.email || request.contact.phone}
                </p>
              ) : null}
            </div>
            <Select
              value={request.status}
              onValueChange={(status) =>
                void setStatus({
                  requestId: request.id,
                  status: status as "new" | "contacted" | "closed",
                })
              }
            >
              <SelectTrigger className="h-11 w-full lg:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">Novo</SelectItem>
                <SelectItem value="contacted">Kontaktirano</SelectItem>
                <SelectItem value="closed">Zatvoreno</SelectItem>
              </SelectContent>
            </Select>
          </article>
        ))}
      </div>
    </section>
  );
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
