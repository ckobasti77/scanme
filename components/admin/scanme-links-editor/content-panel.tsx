"use client";

import {
  ChevronRight,
  GripVertical,
  ImageIcon,
  LoaderCircle,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { TemplateIcon } from "@/components/scanme-links/template-icon";
import { Button } from "@/components/ui/button";
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
import type { Id } from "@/convex/_generated/dataModel";
import {
  DESTINATION_DEFAULTS,
  DESTINATION_KINDS,
  ICON_KEYS,
  normalizeDestinationUrl,
  type DestinationKind,
  type DestinationLifecycle,
} from "@/lib/scanme-links";
import { cn } from "@/lib/utils";
import { LiquidGlassCard } from "@/components/ui/liquid-glass-card";
import { EditorPanel, PanelSection } from "./panel-primitives";

export type EditorDestinationDraft = {
  id: Id<"serviceDestinations">;
  kind: DestinationKind;
  label: string;
  url: string;
  iconKey: string;
  order: number;
  state: DestinationLifecycle;
  publishedState: DestinationLifecycle | null;
  totalClicks: number;
  totalDirectVisits: number;
  updatedAt: number;
  presentation?: "button" | "social";
};

export function ContentPanel({
  businessName,
  description,
  onDescriptionChange,
  onDescriptionCommit,
  logoUrl,
  uploadingLogo,
  onLogoUpload,
  destinations,
  selectedId,
  onSelectDestination,
  addKind,
  onAddKindChange,
  addingDestination,
  onAddDestination,
  onUpdateDestination,
  onDeleteDestination,
}: {
  businessName: string;
  description: string;
  onDescriptionChange: (value: string) => void;
  onDescriptionCommit: () => void;
  logoUrl: string | null;
  uploadingLogo: boolean;
  onLogoUpload: (file: File | undefined) => void;
  destinations: EditorDestinationDraft[];
  selectedId: Id<"serviceDestinations"> | null;
  onSelectDestination: (id: Id<"serviceDestinations">) => void;
  addKind: DestinationKind;
  onAddKindChange: (kind: DestinationKind) => void;
  addingDestination: boolean;
  onAddDestination: (input?: {
    kind: DestinationKind;
    label?: string;
    url?: string;
    iconKey?: string;
    presentation?: "button" | "social";
  }) => void;
  onUpdateDestination: (
    destination: EditorDestinationDraft,
  ) => Promise<void>;
  onDeleteDestination: (id: Id<"serviceDestinations">) => void;
}) {
  const [isAddingInline, setIsAddingInline] = useState(false);
  const selected =
    destinations.find((destination) => destination.id === selectedId) ?? null;

  return (
    <EditorPanel
      title="Sadržaj"
      description="Uredite opis, logotip i linkove koji se prikazuju posetiocima."
    >
      <PanelSection
        title="Podaci lokala"
        description="Naziv se menja na glavnoj ScanMe Links stranici."
      >
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="canonical-business-name" className="text-xs">
              Naziv lokala
            </Label>
            <Input
              id="canonical-business-name"
              value={businessName}
              readOnly
              aria-readonly="true"
              className="h-11 rounded-xl border-[var(--editor-line)] bg-black/[0.025] text-sm"
            />
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="links-description" className="text-xs">
                Kratak opis
              </Label>
              <span className="text-[10px] text-[var(--editor-muted)]">
              {description.length}/160
              </span>
            </div>
            <Textarea
              id="links-description"
              value={description}
              maxLength={160}
              rows={3}
              placeholder="Na primer: Dizajn enterijera · Beograd"
              onChange={(event) => onDescriptionChange(event.target.value)}
              onBlur={onDescriptionCommit}
              className="min-h-20 resize-none rounded-xl border-[var(--editor-line)] bg-[var(--editor-surface-raised)] text-sm leading-5"
            />
          </div>
        </div>
      </PanelSection>

      <PanelSection
        title="Logotip"
        description="PNG, JPEG, WebP ili SVG do 5 MB."
      >
        <label className="group flex min-h-28 cursor-pointer items-center gap-4 rounded-2xl border border-dashed border-[var(--editor-line-strong)] bg-[var(--editor-surface-raised)] p-4 transition-colors hover:border-black focus-within:ring-2 focus-within:ring-black focus-within:ring-offset-2">
          <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-[var(--editor-line)] bg-[var(--editor-surface)]">
            {logoUrl ? (
              // User-provided logos have arbitrary supported aspect ratios.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt=""
                className="size-full object-contain p-2"
              />
            ) : (
              <ImageIcon className="size-6 text-[var(--editor-muted)]" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-xs font-semibold">
              {uploadingLogo ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              {uploadingLogo
                ? "Obrađujemo logotip…"
                : logoUrl
                  ? "Zameni logotip"
                  : "Otpremi logotip"}
            </span>
            <span className="mt-1 block text-[10px] leading-4 text-[var(--editor-muted)]">
              Paletu možete izvući u sekciji Boje brenda.
            </span>
          </span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="sr-only"
            disabled={uploadingLogo}
            onChange={(event) => onLogoUpload(event.target.files?.[0])}
          />
        </label>
      </PanelSection>

      <PanelSection
        title="Linkovi"
        description="Izaberite link za uređivanje. Redosled menjate prevlačenjem u preview-u."
      >
        {destinations.length ? (
          <div className="grid gap-2">
            {destinations.map((destination) => (
              <button
                key={destination.id}
                type="button"
                aria-pressed={destination.id === selectedId}
                onClick={() => onSelectDestination(destination.id)}
                className={cn(
                  "flex min-h-14 items-center gap-3 rounded-xl border px-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2",
                  destination.id === selectedId
                    ? "border-black bg-[var(--editor-lime)]/45"
                    : "border-[var(--editor-line)] bg-[var(--editor-surface-raised)] hover:border-[var(--editor-line-strong)]",
                )}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-black/10 bg-white/70">
                  <TemplateIcon
                    iconKey={destination.iconKey}
                    className="size-4"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold">
                    {destination.label}
                  </span>
                  <span className="mt-1 flex items-center gap-1.5 text-[10px] text-[var(--editor-muted)]">
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        destination.state === "active"
                          ? "bg-[#668f00]"
                          : "bg-black/25",
                      )}
                    />
                    {destinationStateLabel(destination.state)}
                  </span>
                </span>
                <ChevronRight className="size-4 text-[var(--editor-muted)]" />
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--editor-line-strong)] bg-[var(--editor-surface-raised)] px-5 py-7 text-center">
            <span className="mx-auto grid size-11 place-items-center rounded-xl bg-[var(--editor-lime)]">
              <Plus className="size-5" />
            </span>
            <h3 className="mt-4 text-sm font-semibold">Dodajte prvi link</h3>
            <p className="mt-2 text-xs leading-5 text-[var(--editor-muted)]">
              Izaberite društvenu mrežu ili drugu destinaciju ispod.
            </p>
          </div>
        )}

        {isAddingInline ? (
          <InlineAddLinkCard
            adding={addingDestination}
            initialKind={addKind}
            onKindChange={onAddKindChange}
            onAdd={(input) => {
              onAddDestination(input);
              setIsAddingInline(false);
            }}
            onCancel={() => setIsAddingInline(false)}
          />
        ) : (
          <div className="mt-4">
            <Button
              type="button"
              onClick={() => setIsAddingInline(true)}
              disabled={addingDestination}
              className="h-11 w-full gap-2 rounded-xl bg-black text-xs font-semibold text-white hover:bg-black/80"
            >
              {addingDestination ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Dodaj novi link
            </Button>
          </div>
        )}

        {selected ? (
          <DestinationSettings
            key={`${selected.id}-${selected.updatedAt}`}
            destination={selected}
            onSave={onUpdateDestination}
            onDelete={() => onDeleteDestination(selected.id)}
          />
        ) : null}
      </PanelSection>
    </EditorPanel>
  );
}

function DestinationSettings({
  destination,
  onSave,
  onDelete,
}: {
  destination: EditorDestinationDraft;
  onSave: (destination: EditorDestinationDraft) => Promise<void>;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(destination);
  const [saving, setSaving] = useState(false);

  async function save(next = draft) {
    setSaving(true);
    try {
      await onSave(next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-5 rounded-2xl border border-[var(--editor-line)] bg-[var(--editor-surface-raised)] p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold">Uredi link</h3>
        <span
          className="text-[10px] text-[var(--editor-muted)]"
          aria-live="polite"
        >
          {saving ? "Čuvanje…" : "Sačuvano u nacrtu"}
        </span>
      </div>
      <div className="mt-4 grid gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label className="text-[10px] uppercase tracking-wider">Tip</Label>
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
                    draft.iconKey ===
                    DESTINATION_DEFAULTS[draft.kind].iconKey
                      ? DESTINATION_DEFAULTS[kind].iconKey
                      : draft.iconKey,
                };
                setDraft(next);
                void save(next);
              }}
            >
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {DESTINATION_KINDS.map((kind) => (
                  <SelectItem key={kind} value={kind}>
                    {DESTINATION_DEFAULTS[kind].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label className="text-[10px] uppercase tracking-wider">
              Status
            </Label>
            <Select
              value={draft.state}
              onValueChange={(value) => {
                const nextState = value as DestinationLifecycle;
                const normalizedUrl = normalizeDestinationUrl(draft.url);
                if (nextState === "active" && !normalizedUrl) {
                  toast.error("Unesite URL pre nego što aktivirate link.");
                  return;
                }
                const next = {
                  ...draft,
                  url: normalizedUrl,
                  state: nextState,
                };
                setDraft(next);
                void save(next);
              }}
            >
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="active">Aktivno</SelectItem>
                <SelectItem value="inactive">Isključeno</SelectItem>
                <SelectItem value="archived">Arhivirano</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-2">
          <Label className="text-[10px] uppercase tracking-wider">
            Prikaz
          </Label>
          <Select
            value={draft.presentation ?? "button"}
            onValueChange={(value) => {
              const next = {
                ...draft,
                presentation: value as "button" | "social",
              };
              setDraft(next);
              void save(next);
            }}
          >
            <SelectTrigger className="h-10 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="button">Glavno dugme</SelectItem>
              <SelectItem value="social">Društvena ikonica</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <Label
            htmlFor={`destination-label-${destination.id}`}
            className="text-[10px] uppercase tracking-wider"
          >
            Naziv
          </Label>
          <Input
            id={`destination-label-${destination.id}`}
            value={draft.label}
            maxLength={80}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                label: event.target.value,
              }))
            }
            onBlur={() => void save()}
            className="h-10 rounded-xl"
          />
        </div>

        <div className="grid gap-2">
          <Label className="text-[10px] uppercase tracking-wider">
            Ikonica
          </Label>
          <Select
            value={draft.iconKey}
            onValueChange={(iconKey) => {
              const next = { ...draft, iconKey };
              setDraft(next);
              void save(next);
            }}
          >
            <SelectTrigger className="h-10 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {ICON_KEYS.map((icon) => (
                <SelectItem key={icon} value={icon}>
                  <span className="flex items-center gap-2">
                    <TemplateIcon iconKey={icon} className="size-4" />
                    {icon}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <Label
            htmlFor={`destination-url-${destination.id}`}
            className="text-[10px] uppercase tracking-wider"
          >
            HTTPS URL
          </Label>
          <Input
            id={`destination-url-${destination.id}`}
            type="url"
            inputMode="url"
            placeholder="https://"
            value={draft.url}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                url: event.target.value,
              }))
            }
            onBlur={() => {
              const normalizedUrl = normalizeDestinationUrl(draft.url);
              const shouldAutoActivate =
                Boolean(normalizedUrl) && draft.state === "inactive";
              const shouldAutoDeactivate =
                !normalizedUrl && draft.state === "active";
              const nextState: DestinationLifecycle = shouldAutoActivate
                ? "active"
                : shouldAutoDeactivate
                  ? "inactive"
                  : draft.state;
              const next = {
                ...draft,
                url: normalizedUrl,
                state: nextState,
              };
              setDraft(next);
              void save(next);
            }}
            className="h-10 rounded-xl"
          />
        </div>
      </div>

      <Button
        type="button"
        variant="ghost"
        onClick={onDelete}
        className="mt-4 h-10 w-full rounded-xl text-[var(--editor-danger)] hover:bg-[var(--editor-danger)]/8 hover:text-[var(--editor-danger)]"
      >
        <Trash2 className="size-4" />
        Obriši link
      </Button>
    </div>
  );
}

export function PreviewAddButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--links-accent-border)] bg-white/45 text-sm font-semibold text-[#313431] transition-colors hover:bg-white/75 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--links-accent-soft)]"
    >
      <Plus className="size-5" />
      Dodaj novi link
    </button>
  );
}

export function PreviewDragHint() {
  return (
    <div className="mt-4 flex items-center justify-center gap-2 text-[10px] text-[var(--editor-muted)]">
      <GripVertical className="size-3.5" />
      Prevucite link da promenite redosled
    </div>
  );
}

export function destinationStateLabel(state: DestinationLifecycle) {
  if (state === "active") return "Aktivno";
  if (state === "inactive") return "Isključeno";
  if (state === "archived") return "Arhivirano";
  return "Brisanje u nacrtu";
}

function InlineAddLinkCard({
  adding,
  initialKind,
  onKindChange,
  onAdd,
  onCancel,
}: {
  adding: boolean;
  initialKind: DestinationKind;
  onKindChange?: (kind: DestinationKind) => void;
  onAdd: (input: {
    kind: DestinationKind;
    label: string;
    url: string;
    iconKey: string;
    presentation: "button" | "social";
  }) => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<DestinationKind>(initialKind);
  const [label, setLabel] = useState(DESTINATION_DEFAULTS[initialKind].label);
  const [url, setUrl] = useState("");
  const [iconKey, setIconKey] = useState(
    DESTINATION_DEFAULTS[initialKind].iconKey,
  );
  const [presentation, setPresentation] = useState<"button" | "social">(
    "button",
  );

  function changeKind(nextKind: DestinationKind) {
    setKind(nextKind);
    setLabel(DESTINATION_DEFAULTS[nextKind].label);
    setIconKey(DESTINATION_DEFAULTS[nextKind].iconKey);
    onKindChange?.(nextKind);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const rawUrl = url.trim();
    if (!rawUrl) return;
    const normalizedUrl = normalizeDestinationUrl(rawUrl);
    onAdd({
      kind,
      label: label.trim() || DESTINATION_DEFAULTS[kind].label,
      url: normalizedUrl,
      iconKey,
      presentation,
    });
  }

  return (
    <LiquidGlassCard className="mt-4 p-4" tiltEnabled={true}>
      <form onSubmit={submit}>
        <div className="flex items-center justify-between gap-3 border-b border-[var(--editor-line)] pb-3">
          <h3 className="text-xs font-semibold">Novi link</h3>
          <span className="text-[10px] text-[var(--editor-muted)]">
            Popunite i sačuvajte
          </span>
        </div>

        <div className="mt-4 grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-[10px] uppercase tracking-wider">
                Tip / Platforma
              </Label>
              <Select
                value={kind}
                onValueChange={(v) => changeKind(v as DestinationKind)}
              >
                <SelectTrigger className="h-10 rounded-xl border-white/60 bg-white/70 shadow-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-white/60 bg-white/90 backdrop-blur-xl">
                  {DESTINATION_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      <span className="flex items-center gap-2">
                        <TemplateIcon
                          iconKey={DESTINATION_DEFAULTS[k].iconKey}
                          className="size-4"
                        />
                        {DESTINATION_DEFAULTS[k].label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-[10px] uppercase tracking-wider">
                Prikaz
              </Label>
              <Select
                value={presentation}
                onValueChange={(v) => setPresentation(v as "button" | "social")}
              >
                <SelectTrigger className="h-10 rounded-xl border-white/60 bg-white/70 shadow-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-white/60 bg-white/90 backdrop-blur-xl">
                  <SelectItem value="button">Glavno dugme</SelectItem>
                  <SelectItem value="social">Društvena ikonica</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label
              htmlFor="inline-add-url"
              className="text-[10px] uppercase tracking-wider"
            >
              HTTPS URL ili adresa *
            </Label>
            <Input
              id="inline-add-url"
              type="url"
              inputMode="url"
              placeholder="https://"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              autoFocus
              className="h-10 rounded-xl border-white/60 bg-white/70 shadow-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label
                htmlFor="inline-add-label"
                className="text-[10px] uppercase tracking-wider"
              >
                Naziv linka
              </Label>
              <Input
                id="inline-add-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={DESTINATION_DEFAULTS[kind].label}
                className="h-10 rounded-xl border-white/60 bg-white/70 shadow-sm"
              />
            </div>

            <div className="grid gap-1.5">
              <Label className="text-[10px] uppercase tracking-wider">
                Ikonica
              </Label>
              <Select value={iconKey} onValueChange={setIconKey}>
                <SelectTrigger className="h-10 rounded-xl border-white/60 bg-white/70 shadow-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-white/60 bg-white/90 backdrop-blur-xl">
                  {ICON_KEYS.map((icon) => (
                    <SelectItem key={icon} value={icon}>
                      <span className="flex items-center gap-2">
                        <TemplateIcon iconKey={icon} className="size-4" />
                        {icon}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              className="h-10 rounded-xl border-white/60 bg-white/80 shadow-sm hover:bg-white"
            >
              Otkaži
            </Button>
            <Button
              type="submit"
              disabled={adding || !url.trim()}
              className="h-10 rounded-xl bg-black font-semibold text-white shadow-md hover:bg-black/80"
            >
              {adding ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Sačuvaj link
            </Button>
          </div>
        </div>
      </form>
    </LiquidGlassCard>
  );
}
