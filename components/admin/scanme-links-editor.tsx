"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  ArrowLeft,
  Check,
  ExternalLink,
  GripVertical,
  LoaderCircle,
  Plus,
  Send,
  Settings2,
  Smartphone,
  Trash2,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type SetStateAction } from "react";
import { toast } from "sonner";
import { AdminGuard } from "@/components/admin/admin-guard";
import { BrandLogo } from "@/components/brand-logo";
import {
  OptionTwoDestinationContent,
  OptionTwoFrame,
  optionTwoDestinationClassName,
  optionTwoDuplicateNumber,
} from "@/components/scanme-links/templates/option-two/option-two-template";
import type { ScanMeLinksViewModel } from "@/components/scanme-links/templates/types";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import {
  createAccentTokens,
  extractAccentCandidates,
} from "@/lib/accent-palette";
import {
  DEFAULT_ACCENT,
  DEFAULT_ACCENT_TOKENS,
  DESTINATION_DEFAULTS,
  DESTINATION_KINDS,
  ICON_KEYS,
  TEMPLATE_REGISTRY,
  defaultBackgroundForTemplate,
  type DestinationKind,
  type DestinationLifecycle,
  type TemplateKey,
} from "@/lib/scanme-links";
import { cn } from "@/lib/utils";

type EditorData = NonNullable<
  FunctionReturnType<typeof api.scanMeLinks.editor>
>;

type EditorDestination = EditorData["destinations"][number];

type AppearanceDraft = {
  displayName: string;
  templateKey: TemplateKey;
  backgroundKey: string;
  palette: string[];
  accent: string;
  accentTokens: typeof DEFAULT_ACCENT_TOKENS;
  logoStorageId?: Id<"_storage">;
  logoUrl: string | null;
};

export function ScanMeLinksEditorScreen({
  businessId,
}: {
  businessId: string;
}) {
  return (
    <AdminGuard>
      <EditorLoader businessId={businessId as Id<"businesses">} />
    </AdminGuard>
  );
}

function EditorLoader({ businessId }: { businessId: Id<"businesses"> }) {
  const data = useQuery(api.scanMeLinks.editor, { businessId });

  if (data === undefined) {
    return (
      <div className="min-h-[100dvh] bg-background p-5">
        <div className="h-1 w-48 animate-pulse bg-primary" />
      </div>
    );
  }
  if (!data?.profile || !data.config) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-background px-4">
        <section className="w-full max-w-lg border border-border bg-card p-7">
          <h1 className="text-2xl font-semibold">Editor nije dostupan</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            ScanMe Links profil za ovaj lokal nije pronađen.
          </p>
          <Button asChild className="mt-6">
            <Link href="/admin/scanme-links">Nazad na lokale</Link>
          </Button>
        </section>
      </main>
    );
  }

  return <EditorWorkspace data={data} />;
}

function EditorWorkspace({ data }: { data: EditorData }) {
  const config = data.config!;
  const profile = data.profile!;
  const serverAppearance = appearanceFromData(data);
  const [appearanceOverride, setAppearanceOverride] =
    useState<AppearanceDraft | null>(null);
  const appearance = appearanceOverride ?? serverAppearance;
  const setAppearance = (next: SetStateAction<AppearanceDraft>) => {
    setAppearanceOverride((current) => {
      const base = current ?? serverAppearance;
      return typeof next === "function" ? next(base) : next;
    });
  };
  const [preferredSelectedId, setSelectedId] =
    useState<Id<"serviceDestinations"> | null>(
      data.destinations[0]?.id ?? null,
    );
  const [mobilePanel, setMobilePanel] = useState<"settings" | "preview">(
    "settings",
  );
  const [publishOpen, setPublishOpen] = useState(false);
  const [deleteId, setDeleteId] =
    useState<Id<"serviceDestinations"> | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [addKind, setAddKind] = useState<DestinationKind>("instagram");

  const saveAppearance = useMutation(api.scanMeLinks.saveDraftAppearance);
  const generateUploadUrl = useMutation(
    api.scanMeLinks.generateDisplayLogoUploadUrl,
  );
  const addDestination = useMutation(api.scanMeLinks.addDestination);
  const reorderDestinations = useMutation(
    api.scanMeLinks.reorderDestinations,
  );
  const discardDraft = useMutation(api.scanMeLinks.discardDraft);
  const publishDraft = useMutation(api.scanMeLinks.publishDraft);
  const markDeleted = useMutation(api.scanMeLinks.markDestinationDeleted);

  const destinations = useMemo(
    () => [...data.destinations].sort((a, b) => a.order - b.order),
    [data.destinations],
  );
  const selectedId =
    preferredSelectedId &&
    destinations.some(
      (destination) => destination.id === preferredSelectedId,
    )
      ? preferredSelectedId
      : (destinations[0]?.id ?? null);
  const activeDestinations = destinations.filter(
    (destination) => destination.state === "active",
  );
  const selected =
    destinations.find((destination) => destination.id === selectedId) ?? null;
  const preview: ScanMeLinksViewModel = {
    displayName: appearance.displayName.trim() || data.name,
    logoUrl: appearance.logoUrl,
    templateKey: appearance.templateKey,
    backgroundKey: appearance.backgroundKey as "warm-ivory",
    accent: appearance.accent,
    accentTokens: appearance.accentTokens,
    destinations: activeDestinations.map((destination) => ({
      id: destination.id,
      kind: destination.kind,
      label: destination.label,
      url: destination.url,
      iconKey: destination.iconKey,
    })),
  };
  const backgrounds = TEMPLATE_REGISTRY[appearance.templateKey].backgrounds;

  async function persistAppearance(next = appearance) {
    setSaving(true);
    try {
      await saveAppearance({
        serviceProfileId: profile.id,
        displayName: next.displayName.trim() || data.name,
        ...(next.logoStorageId ? { logoStorageId: next.logoStorageId } : {}),
        templateKey: next.templateKey,
        backgroundKey: next.backgroundKey,
        palette: next.palette,
        accent: next.accent,
        accentTokens: next.accentTokens,
      });
    } catch (error) {
      toast.error(errorMessage(error, "Nacrt nije sačuvan."));
    } finally {
      setSaving(false);
    }
  }

  async function uploadLogo(file: File | undefined) {
    if (!file) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      toast.error("Logo mora biti PNG, JPEG ili WebP fajl do 5 MB.");
      return;
    }
    setUploading(true);
    try {
      const [uploadUrl, palette] = await Promise.all([
        generateUploadUrl({ serviceProfileId: profile.id }),
        extractAccentCandidates(file),
      ]);
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) throw new Error("Logo nije otpremljen.");
      const { storageId } = (await response.json()) as {
        storageId: Id<"_storage">;
      };
      const accent = palette[0] ?? DEFAULT_ACCENT;
      const next: AppearanceDraft = {
        ...appearance,
        logoStorageId: storageId,
        logoUrl: URL.createObjectURL(file),
        palette,
        accent,
        accentTokens: createAccentTokens(accent),
      };
      setAppearance(next);
      await persistAppearance(next);
      toast.success("Logo i predlozi boja su sačuvani u nacrtu.");
    } catch (error) {
      toast.error(errorMessage(error, "Logo nije otpremljen."));
    } finally {
      setUploading(false);
    }
  }

  async function addNewDestination() {
    try {
      const result = await addDestination({
        serviceProfileId: profile.id,
        kind: addKind,
      });
      setSelectedId(result.destinationId);
      setMobilePanel("settings");
      toast.success("Destinacija je dodata u nacrt.");
    } catch (error) {
      toast.error(errorMessage(error, "Destinacija nije dodata."));
    }
  }

  async function reorder(destinationIds: Id<"serviceDestinations">[]) {
    try {
      await reorderDestinations({
        serviceProfileId: profile.id,
        destinationIds,
      });
    } catch (error) {
      toast.error(errorMessage(error, "Redosled nije sačuvan."));
      throw error;
    }
  }

  async function discard() {
    if (
      !window.confirm(
        "Odbaciti sve izmene nacrta i vratiti poslednju objavljenu verziju?",
      )
    ) {
      return;
    }
    try {
      await discardDraft({ serviceProfileId: profile.id });
      setAppearanceOverride(null);
      setSelectedId(null);
      toast.success("Nacrt je vraćen na poslednju objavljenu verziju.");
    } catch (error) {
      toast.error(errorMessage(error, "Nacrt nije odbačen."));
    }
  }

  async function publish() {
    setPublishing(true);
    try {
      await publishDraft({
        serviceProfileId: profile.id,
        expectedDraftRevision: config.draftRevision,
      });
      setPublishOpen(false);
      toast.success("ScanMe Links stranica je objavljena.");
    } catch (error) {
      toast.error(errorMessage(error, "Izmene nisu objavljene."));
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="min-h-[100dvh] overflow-x-clip bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-[1600px] items-center gap-3 px-4 lg:px-8">
          <Button asChild variant="ghost" size="icon" aria-label="Nazad na ScanMe Links lokale">
            <Link href="/admin/scanme-links">
              <ArrowLeft className="size-5" />
            </Link>
          </Button>
          <Link
            href="/admin/scanme-links"
            className="hidden shrink-0 sm:block"
            aria-label="ScanMe Admin"
          >
            <BrandLogo width="6rem" />
          </Link>
          <div className="min-w-0 flex-1 border-l border-border pl-3">
            <p className="truncate text-sm font-semibold">{data.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              Uredi ScanMe Links stranicu
            </p>
          </div>
          <span
            className="hidden text-xs text-muted-foreground md:inline"
            aria-live="polite"
          >
            {saving
              ? "Čuvanje..."
              : config.hasUnpublishedChanges
                ? "Nacrt ima izmene"
                : "Sve izmene su objavljene"}
          </span>
          <ThemeToggle />
          <Button
            type="button"
            variant="outline"
            className="hidden sm:inline-flex"
            onClick={() => void discard()}
            disabled={!config.hasUnpublishedChanges || publishing}
          >
            Odbaci
          </Button>
          <Button
            type="button"
            onClick={() => setPublishOpen(true)}
            disabled={!config.hasUnpublishedChanges || publishing}
          >
            <Send className="size-4" />
            <span className="hidden sm:inline">Objavi izmene</span>
            <span className="sm:hidden">Objavi</span>
          </Button>
        </div>
      </header>

      <div
        role="tablist"
        aria-label="Prikaz editora"
        className="sticky top-16 z-20 grid grid-cols-2 border-b border-border bg-background p-2 lg:hidden"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mobilePanel === "settings"}
          onClick={() => setMobilePanel("settings")}
          className={cn(
            "flex min-h-11 items-center justify-center gap-2 border px-3 text-sm font-semibold",
            mobilePanel === "settings"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-transparent text-muted-foreground",
          )}
        >
          <Settings2 className="size-4" /> Podešavanja
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobilePanel === "preview"}
          onClick={() => setMobilePanel("preview")}
          className={cn(
            "flex min-h-11 items-center justify-center gap-2 border px-3 text-sm font-semibold",
            mobilePanel === "preview"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-transparent text-muted-foreground",
          )}
        >
          <Smartphone className="size-4" /> Preview
        </button>
      </div>

      <main className="mx-auto grid max-w-[1600px] lg:grid-cols-[minmax(0,1fr)_minmax(430px,0.78fr)]">
        <section
          role="tabpanel"
          className={cn(
            "min-w-0 border-r border-border px-4 py-6 lg:block lg:px-8 lg:py-8",
            mobilePanel !== "settings" && "hidden",
          )}
        >
          <div className="mx-auto grid max-w-3xl gap-6">
            <section className="border border-border bg-card p-5 sm:p-6">
              <h1 className="text-xl font-semibold tracking-[-0.03em]">
                Identitet i izgled
              </h1>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Sve izmene se automatski čuvaju u nacrtu.
              </p>
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="links-display-name">Naziv za prikaz</Label>
                  <Input
                    id="links-display-name"
                    value={appearance.displayName}
                    onChange={(event) =>
                      setAppearance((current) => ({
                        ...current,
                        displayName: event.target.value,
                      }))
                    }
                    onBlur={() => void persistAppearance()}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Template</Label>
                  <Select
                    value={appearance.templateKey}
                    onValueChange={(value) => {
                      const templateKey = value as TemplateKey;
                      const next = {
                        ...appearance,
                        templateKey,
                        backgroundKey:
                          defaultBackgroundForTemplate(templateKey),
                      };
                      setAppearance(next);
                      void persistAppearance(next);
                    }}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(TEMPLATE_REGISTRY).map((template) => (
                        <SelectItem key={template.key} value={template.key}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Pozadina</Label>
                  <Select
                    value={appearance.backgroundKey}
                    onValueChange={(backgroundKey) => {
                      const next = { ...appearance, backgroundKey };
                      setAppearance(next);
                      void persistAppearance(next);
                    }}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {backgrounds.map((background) => (
                        <SelectItem key={background.key} value={background.key}>
                          {background.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="links-logo">
                    Logo, PNG/JPEG/WebP do 5 MB
                  </Label>
                  <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 border border-dashed border-border px-4 text-sm transition-colors hover:border-primary focus-within:ring-2 focus-within:ring-ring">
                    {uploading ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <Upload className="size-4" />
                    )}
                    {uploading ? "Obrada logotipa..." : "Izaberi logo"}
                    <input
                      id="links-logo"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      disabled={uploading}
                      onChange={(event) =>
                        void uploadLogo(event.target.files?.[0])
                      }
                    />
                  </label>
                </div>
                <div className="grid gap-3 sm:col-span-2">
                  <Label>Predlozi akcentne boje</Label>
                  <div className="flex flex-wrap items-center gap-3">
                    {(appearance.palette.length
                      ? appearance.palette
                      : [appearance.accent]
                    ).map((color) => (
                      <button
                        key={color}
                        type="button"
                        aria-label={`Izaberi akcentnu boju ${color}`}
                        aria-pressed={appearance.accent === color}
                        onClick={() => {
                          const next = {
                            ...appearance,
                            accent: color,
                            accentTokens: createAccentTokens(color),
                          };
                          setAppearance(next);
                          void persistAppearance(next);
                        }}
                        className="grid size-12 place-items-center border-2 border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        style={{ backgroundColor: color }}
                      >
                        {appearance.accent === color ? (
                          <Check className="size-4 text-white drop-shadow-sm" />
                        ) : null}
                      </button>
                    ))}
                    <Input
                      type="color"
                      aria-label="Ručno izaberi akcentnu boju"
                      value={appearance.accent}
                      className="h-12 w-16 cursor-pointer p-1"
                      onChange={(event) => {
                        const accent = event.target.value.toUpperCase();
                        setAppearance((current) => ({
                          ...current,
                          accent,
                          accentTokens: createAccentTokens(accent),
                        }));
                      }}
                      onBlur={() => void persistAppearance()}
                    />
                    <Input
                      aria-label="HEX akcentna boja"
                      value={appearance.accent}
                      className="h-12 w-32"
                      onChange={(event) =>
                        setAppearance((current) => ({
                          ...current,
                          accent: event.target.value.toUpperCase(),
                        }))
                      }
                      onBlur={() => {
                        const accent = appearance.accent;
                        if (/^#[0-9A-F]{6}$/.test(accent)) {
                          const next = {
                            ...appearance,
                            accent,
                            accentTokens: createAccentTokens(accent),
                          };
                          setAppearance(next);
                          void persistAppearance(next);
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="border border-border bg-card p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold tracking-[-0.03em]">
                    Destinacije
                  </h2>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    Izaberite dugme ovde ili direktno na telefonu. Redosled
                    menjate prevlačenjem dugmeta na telefonu.
                  </p>
                </div>
                <div className="flex min-w-0 gap-2">
                  <Select
                    value={addKind}
                    onValueChange={(value) =>
                      setAddKind(value as DestinationKind)
                    }
                  >
                    <SelectTrigger className="h-11 min-w-0 flex-1 sm:w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DESTINATION_KINDS.map((kind) => (
                        <SelectItem key={kind} value={kind}>
                          {DESTINATION_DEFAULTS[kind].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void addNewDestination()}
                  >
                    <Plus className="size-4" /> Dodaj
                  </Button>
                </div>
              </div>

              {destinations.length ? (
                <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {destinations.map((destination) => (
                    <button
                      key={destination.id}
                      type="button"
                      onClick={() => setSelectedId(destination.id)}
                      className={cn(
                        "min-h-12 border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        selectedId === destination.id
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border hover:bg-secondary",
                      )}
                    >
                      <span className="block truncate font-semibold">
                        {destination.label}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {destinationStateLabel(destination.state)}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-5 border border-dashed border-border p-5 text-sm leading-6 text-muted-foreground">
                  Dodajte prvu destinaciju. Servis ostaje neaktivan dok ne
                  objavite najmanje jednu aktivnu destinaciju.
                </div>
              )}

              {selected ? (
                <DestinationSettings
                  key={`${selected.id}-${selected.updatedAt}`}
                  destination={selected}
                  onDelete={() => setDeleteId(selected.id)}
                />
              ) : null}
            </section>
          </div>
        </section>

        <section
          role="tabpanel"
          className={cn(
            "min-w-0 bg-muted/35 px-4 py-6 lg:block lg:px-8 lg:py-8",
            mobilePanel !== "preview" && "hidden",
          )}
        >
          <div className="mx-auto lg:sticky lg:top-24">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Preview nacrta</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Prevucite celo dugme da promenite redosled.
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href={`/${profile.slug}`} target="_blank">
                  <ExternalLink className="size-4" /> Javna stranica
                </Link>
              </Button>
            </div>
            <div className="mx-auto max-w-[420px] rounded-[2.55rem] border-[9px] border-[#181a1b] bg-[#181a1b] p-1 shadow-[0_28px_70px_rgba(0,0,0,.28)]">
              <SortablePhonePreview
                key={destinations
                  .map(
                    (destination) =>
                      `${destination.id}:${destination.order}:${destination.state}`,
                  )
                  .join("|")}
                view={preview}
                destinations={destinations}
                selectedId={selectedId}
                onSelect={(id) => {
                  setSelectedId(id);
                  setMobilePanel("settings");
                }}
                onReorder={reorder}
              />
            </div>
          </div>
        </section>
      </main>

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
              <Button variant="outline" disabled={publishing}>
                Otkaži
              </Button>
            </DialogClose>
            <Button onClick={() => void publish()} disabled={publishing}>
              {publishing ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Objavi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteId)}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Trajno obrisati destinaciju?</DialogTitle>
            <DialogDescription>
              Brisanje će nakon objave ukloniti destinaciju i svu njenu metriku.
              Ovu radnju nije moguće poništiti.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Otkaži</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!deleteId) return;
                try {
                  await markDeleted({ destinationId: deleteId });
                  setDeleteId(null);
                  toast.success("Brisanje je dodato u nacrt.");
                } catch (error) {
                  toast.error(
                    errorMessage(error, "Brisanje nije dodato u nacrt."),
                  );
                }
              }}
            >
              <Trash2 className="size-4" /> Dodaj brisanje u nacrt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function appearanceFromData(data: EditorData): AppearanceDraft {
  const config = data.config!;
  return {
    displayName: config.displayName,
    templateKey: config.templateKey as TemplateKey,
    backgroundKey: config.backgroundKey,
    palette: config.palette,
    accent: config.accent,
    accentTokens: config.accentTokens,
    logoUrl: config.logoUrl,
  };
}

function DestinationSettings({
  destination,
  onDelete,
}: {
  destination: EditorDestination;
  onDelete: () => void;
}) {
  const update = useMutation(api.scanMeLinks.updateDestination);
  const [draft, setDraft] = useState(destination);
  const [saving, setSaving] = useState(false);

  async function save(next = draft) {
    setSaving(true);
    try {
      await update({
        destinationId: destination.id,
        kind: next.kind,
        label: next.label,
        url: next.url,
        iconKey: next.iconKey,
        state: next.state,
      });
    } catch (error) {
      toast.error(errorMessage(error, "Destinacija nije sačuvana."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6 border-t border-border pt-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">Podešavanja dugmeta</h3>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {saving ? "Čuvanje..." : "Sačuvano u nacrtu"}
        </span>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label>Tip</Label>
          <Select
            value={draft.kind}
            onValueChange={(value) => {
              const kind = value as DestinationKind;
              const next = {
                ...draft,
                kind,
                label:
                  draft.label === DESTINATION_DEFAULTS[draft.kind].label
                    ? DESTINATION_DEFAULTS[kind].label
                    : draft.label,
                iconKey:
                  draft.iconKey === DESTINATION_DEFAULTS[draft.kind].iconKey
                    ? DESTINATION_DEFAULTS[kind].iconKey
                    : draft.iconKey,
              };
              setDraft(next);
              void save(next);
            }}
          >
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DESTINATION_KINDS.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {DESTINATION_DEFAULTS[kind].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>Status</Label>
          <Select
            value={draft.state}
            onValueChange={(value) => {
              const next = {
                ...draft,
                state: value as DestinationLifecycle,
              };
              setDraft(next);
              void save(next);
            }}
          >
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Aktivno</SelectItem>
              <SelectItem value="inactive">Isključeno</SelectItem>
              <SelectItem value="archived">Arhivirano</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`destination-label-${destination.id}`}>Naziv</Label>
          <Input
            id={`destination-label-${destination.id}`}
            value={draft.label}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                label: event.target.value,
              }))
            }
            onBlur={() => void save()}
          />
        </div>
        <div className="grid gap-2">
          <Label>Ikonica</Label>
          <Select
            value={draft.iconKey}
            onValueChange={(iconKey) => {
              const next = { ...draft, iconKey };
              setDraft(next);
              void save(next);
            }}
          >
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ICON_KEYS.map((icon) => (
                <SelectItem key={icon} value={icon}>
                  {icon}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor={`destination-url-${destination.id}`}>
            HTTPS URL
          </Label>
          <Input
            id={`destination-url-${destination.id}`}
            type="url"
            placeholder="https://"
            value={draft.url}
            onChange={(event) =>
              setDraft((current) => ({ ...current, url: event.target.value }))
            }
            onBlur={() => void save()}
          />
        </div>
      </div>
      <div className="mt-5 flex justify-end">
        <Button type="button" variant="destructive" onClick={onDelete}>
          <Trash2 className="size-4" /> Trajno obriši
        </Button>
      </div>
    </div>
  );
}

function SortablePhonePreview({
  view,
  destinations,
  selectedId,
  onSelect,
  onReorder,
}: {
  view: ScanMeLinksViewModel;
  destinations: EditorDestination[];
  selectedId: Id<"serviceDestinations"> | null;
  onSelect: (id: Id<"serviceDestinations">) => void;
  onReorder: (ids: Id<"serviceDestinations">[]) => Promise<void>;
}) {
  const serverActive = destinations
    .filter((destination) => destination.state === "active")
    .sort((a, b) => a.order - b.order);
  const [orderedIds, setOrderedIds] = useState(() =>
    serverActive.map((destination) => destination.id),
  );
  const activeById = new Map(
    serverActive.map((destination) => [destination.id, destination]),
  );
  const active = orderedIds
    .map((destinationId) => activeById.get(destinationId))
    .filter((destination): destination is EditorDestination =>
      Boolean(destination),
    );
  const viewById = new Map(
    view.destinations.map((destination) => [destination.id, destination]),
  );
  const orderedViewDestinations = active
    .map((destination) => viewById.get(destination.id))
    .filter(
      (
        destination,
      ): destination is ScanMeLinksViewModel["destinations"][number] =>
        Boolean(destination),
    );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    const oldIndex = active.findIndex(
      (destination) => destination.id === event.active.id,
    );
    const newIndex = active.findIndex(
      (destination) => destination.id === event.over?.id,
    );
    if (oldIndex < 0 || newIndex < 0) return;
    const movedActive = arrayMove(active, oldIndex, newIndex);
    const previousIds = orderedIds;
    setOrderedIds(movedActive.map((destination) => destination.id));
    let activeIndex = 0;
    const merged = [...destinations]
      .sort((a, b) => a.order - b.order)
      .map((destination) =>
        destination.state === "active"
          ? movedActive[activeIndex++]
          : destination,
      );
    void onReorder(merged.map((destination) => destination.id)).catch(() => {
      setOrderedIds(previousIds);
    });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext
        items={active.map((destination) => destination.id)}
        strategy={verticalListSortingStrategy}
      >
        <OptionTwoFrame view={view} preview>
          {active.length ? (
            <ul className="grid gap-5 pl-3">
              {active.map((destination, index) => (
                <SortablePreviewDestination
                  key={destination.id}
                  destination={orderedViewDestinations[index]}
                  duplicate={optionTwoDuplicateNumber(
                    orderedViewDestinations,
                    index,
                  )}
                  selected={selectedId === destination.id}
                  onSelect={() => onSelect(destination.id)}
                />
              ))}
            </ul>
          ) : (
            <div className="rounded-3xl border border-dashed border-[var(--links-accent-border)] bg-white/55 px-5 py-8 text-center text-sm leading-6 text-[#5d6063]">
              Uključite najmanje jednu destinaciju da biste videli dugmad.
            </div>
          )}
        </OptionTwoFrame>
      </SortableContext>
    </DndContext>
  );
}

function SortablePreviewDestination({
  destination,
  duplicate,
  selected,
  onSelect,
}: {
  destination: ScanMeLinksViewModel["destinations"][number];
  duplicate: number | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: destination.id });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        transition,
      }}
      className={cn(isDragging && "relative z-20")}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        style={{ borderRadius: "9999px" }}
        aria-pressed={selected}
        aria-label={`${destination.label}. Kliknite za uređivanje ili prevucite da promenite redosled.`}
        onClick={onSelect}
        className={cn(
          optionTwoDestinationClassName,
          "cursor-grab active:cursor-grabbing",
          selected &&
            "ring-4 ring-[var(--links-accent-soft)] ring-offset-2 ring-offset-[#f8f5ef]",
          isDragging && "shadow-[0_22px_50px_rgba(0,0,0,.24)]",
        )}
      >
        <span className="sr-only">
          <GripVertical className="size-4" /> Promeni redosled
        </span>
        <OptionTwoDestinationContent
          destination={destination}
          duplicate={duplicate}
        />
      </button>
    </li>
  );
}

function destinationStateLabel(state: DestinationLifecycle) {
  if (state === "active") return "Aktivno";
  if (state === "inactive") return "Isključeno";
  if (state === "archived") return "Arhivirano";
  return "Brisanje u nacrtu";
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
