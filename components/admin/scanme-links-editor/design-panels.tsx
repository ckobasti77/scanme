"use client";

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeftRight,
  Check,
  CircleAlert,
  ImageIcon,
  LoaderCircle,
  RotateCcw,
  Sparkles,
  Upload,
} from "lucide-react";
import { useState, type ChangeEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AdvancedColorPickerDialog } from "./advanced-color-picker-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_SCANME_DESIGN,
  PRESET_DESIGNS,
  SCANME_PRESET_KEYS,
  scanMeContrastIssues,
  wcagContrast,
  type PaletteAnalysis,
  type ScanMeBackground,
  type ScanMeDesignColors,
  type ScanMeDesignV1,
  type ScanMePresetKey,
} from "@/lib/scanme-design";
import { cn } from "@/lib/utils";
import {
  ChoiceCard,
  EditorPanel,
  NativeSwitch,
  PanelSection,
  SegmentedControl,
} from "./panel-primitives";

const PRESET_LABELS: Record<
  ScanMePresetKey,
  { label: string; description: string }
> = {
  gentle: {
    label: "Gentle",
    description: "Topao, miran i nenametljiv",
  },
  lux: { label: "Lux", description: "Taman izgled sa zlatnim akcentom" },
  ios: { label: "iOS", description: "Čisto staklo i plavi detalji" },
  frosty: { label: "Frosty", description: "Hladan, prozračan izgled" },
  noir: { label: "Noir", description: "Crno-beli minimalizam" },
  neon: { label: "Neon", description: "Odvažan noćni akcenat" },
  nature: { label: "Nature", description: "Organski tonovi i slika" },
};

export function QuickStylesPanel({
  design,
  isInitialized,
  applyingPreset,
  onApplyPreset,
  onSuggestFromLogo,
  renderPresetPreview,
}: {
  design: ScanMeDesignV1;
  isInitialized: boolean;
  applyingPreset: ScanMePresetKey | null;
  onApplyPreset: (preset: ScanMePresetKey) => void;
  onSuggestFromLogo: () => void;
  renderPresetPreview: (preset: ScanMePresetKey) => ReactNode;
}) {
  return (
    <EditorPanel
      title="Brzi stilovi"
      description="Izaberite osnovu. Svaki detalj možete promeniti kasnije."
      footer={
        <p className="flex items-center gap-2 text-xs text-[var(--editor-muted)]">
          <span className="grid size-5 place-items-center rounded-full bg-[var(--editor-lime)] text-black">
            <Check className="size-3.5" />
          </span>
          {!isInitialized
            ? "Izaberite stil da biste započeli"
            : design.presetKey === "custom"
            ? "Stil je ručno prilagođen"
            : `${PRESET_LABELS[design.presetKey].label} je primenjen`}
        </p>
      }
    >
      <Button
        type="button"
        variant="outline"
        onClick={onSuggestFromLogo}
        className="h-11 w-full rounded-xl border-[var(--editor-line-strong)] bg-[var(--editor-surface-raised)]"
      >
        <Sparkles className="size-4" />
        Predloži iz logotipa
      </Button>

      <PanelSection
        title="Preporučeni stilovi"
        description="Primena stila menja samo nacrt."
        className="mt-6"
      >
        <div className="grid grid-cols-2 gap-3">
          {SCANME_PRESET_KEYS.map((preset) => {
            const selected = isInitialized && design.presetKey === preset;
            const applying = applyingPreset === preset;
            return (
              <ChoiceCard
                key={preset}
                label={`Primeni ${PRESET_LABELS[preset].label} stil`}
                selected={selected}
                disabled={applyingPreset !== null}
                onClick={() => onApplyPreset(preset)}
                className="overflow-hidden p-2"
              >
                <div className="relative aspect-[4/5] overflow-hidden rounded-lg border border-black/10 bg-white">
                  {renderPresetPreview(preset)}
                </div>
                <div className="flex items-start gap-2 px-1 pb-1 pt-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold">
                      {PRESET_LABELS[preset].label}
                    </span>
                    <span className="mt-1 block text-[9px] leading-3 text-[var(--editor-muted)]">
                      {PRESET_LABELS[preset].description}
                    </span>
                  </span>
                  {applying ? (
                    <LoaderCircle className="size-4 shrink-0 animate-spin" />
                  ) : selected ? (
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[var(--editor-lime)]">
                      <Check className="size-3" />
                    </span>
                  ) : null}
                </div>
              </ChoiceCard>
            );
          })}
        </div>
      </PanelSection>
    </EditorPanel>
  );
}

export function BrandColorsPanel({
  design,
  isInitialized,
  paletteAnalysis,
  logoUrl,
  uploadingLogo,
  onLogoUpload,
  extractingPalette,
  onExtractPalette,
  onDesignChange,
  onReset,
}: {
  design: ScanMeDesignV1;
  isInitialized: boolean;
  paletteAnalysis?: PaletteAnalysis;
  logoUrl: string | null;
  uploadingLogo: boolean;
  onLogoUpload: (file: File | undefined) => void;
  extractingPalette: boolean;
  onExtractPalette: () => void;
  onDesignChange: (design: ScanMeDesignV1) => void;
  onReset: () => void;
}) {
  const issues = scanMeContrastIssues(design);
  const original = paletteAnalysis?.original ?? [];
  const adjusted = paletteAnalysis?.adjusted ?? [];

  function setColor(role: keyof ScanMeDesignColors, color: string) {
    const nextColors = { ...design.colors, [role]: color };
    let nextBackground = design.background;

    if (role === "page") {
      if (nextBackground.kind === "solid") {
        nextBackground = { ...nextBackground, color };
      } else if (nextBackground.kind === "pattern") {
        nextBackground = { ...nextBackground, backgroundColor: color };
      } else if (nextBackground.kind === "gradient") {
        nextBackground = { ...nextBackground, from: color };
      }
    }

    let nextButtons = design.buttons;
    if (role === "border" && nextButtons.borderWidth === 0) {
      nextButtons = { ...nextButtons, borderWidth: 1 };
    }

    onDesignChange({
      ...design,
      presetKey: "custom",
      colors: nextColors,
      background: nextBackground,
      buttons: nextButtons,
    });
  }

  return (
    <EditorPanel
      title="Boje brenda"
      description="Izvucite paletu iz logotipa ili podesite svaku ulogu ručno."
      footer={
        <ContrastStatus issues={issues} autoContrast={design.autoContrast} design={design} />
      }
    >
      <PanelSection title="Logotip i paleta">
        <label className="flex min-h-24 cursor-pointer items-center gap-4 rounded-2xl border border-dashed border-[var(--editor-line-strong)] bg-[var(--editor-surface-raised)] p-4 hover:border-black focus-within:ring-2 focus-within:ring-black">
          <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-[var(--editor-line)]">
            {logoUrl ? (
              // User-supplied asset with arbitrary aspect ratio.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="size-full object-contain p-2" />
            ) : (
              <ImageIcon className="size-5 text-[var(--editor-muted)]" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-xs font-semibold">
              {uploadingLogo ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              {logoUrl ? "Zameni logotip" : "Otpremi logotip"}
            </span>
            <span className="mt-1 block text-[10px] leading-4 text-[var(--editor-muted)]">
              PNG, JPEG, WebP ili SVG do 5 MB
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
        <Button
          type="button"
          onClick={onExtractPalette}
          disabled={!logoUrl || extractingPalette}
          className="mt-3 h-11 w-full rounded-xl"
        >
          {extractingPalette ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {adjusted.length ? "Ponovo izvuci boje" : "Izvuci boje iz logotipa"}
        </Button>
      </PanelSection>

      {original.length || adjusted.length ? (
        <PanelSection
          title="Izvučena paleta"
          description={
            paletteAnalysis?.correctedRoles.length
              ? `Automatski su korigovane uloge: ${paletteAnalysis.correctedRoles.join(", ")}. Kliknite na bilo koju boju da je izmenite.`
              : "Kliknite na bilo koju boju iz palete da je prilagodite u naprednom color picker-u."
          }
        >
          <PaletteRow
            label="Original"
            colors={original}
            presetSwatches={adjusted}
          />
          <PaletteRow
            label="Prilagođeno (WCAG AA)"
            colors={adjusted}
            presetSwatches={adjusted}
            className="mt-3"
            onColorChange={(_index, newHex) => {
              onDesignChange({
                ...design,
                presetKey: "custom",
                colors: { ...design.colors, accent: newHex },
              });
            }}
          />
        </PanelSection>
      ) : null}

      {isInitialized ? (
        <>
          <PanelSection title="Uloge boja">
            <div className="grid gap-2">
              {(
                [
                  ["page", "Pozadina stranice"],
                  ["surface", "Površina"],
                  ["button", "Dugme"],
                  ["buttonHover", "Dugme na prelaz"],
                  ["buttonText", "Tekst dugmeta"],
                  ["title", "Naslov"],
                  ["body", "Opis"],
                  ["accent", "Akcenat"],
                  ["border", "Border"],
                  ["focus", "Focus ring"],
                ] as const
              ).map(([role, label]) => (
                <ColorRoleField
                  key={role}
                  label={label}
                  value={design.colors[role]}
                  presetSwatches={adjusted}
                  onCommit={(value) => setColor(role, value)}
                />
              ))}
            </div>
          </PanelSection>

          <PanelSection>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold">
                  Automatski popravi kontrast
                </p>
                <p className="mt-1 text-[10px] leading-4 text-[var(--editor-muted)]">
                  Boje se koriguju samo koliko je potrebno za WCAG AA.
                </p>
              </div>
              <NativeSwitch
                checked={design.autoContrast}
                onCheckedChange={(autoContrast) =>
                  onDesignChange({
                    ...design,
                    presetKey: "custom",
                    autoContrast,
                  })
                }
                label="Automatski popravi kontrast"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={onReset}
              className="mt-5 h-10 w-full rounded-xl text-xs"
            >
              <RotateCcw className="size-4" />
              Vrati boje aktivnog stila
            </Button>
            {logoUrl ? (
              <button
                type="button"
                onClick={onExtractPalette}
                disabled={extractingPalette}
                className="mt-2 block w-full text-center text-xs font-medium underline text-[var(--editor-muted)] hover:text-black"
              >
                Ponovo izvuci boje
              </button>
            ) : null}
          </PanelSection>
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-[var(--editor-line-strong)] bg-[var(--editor-surface-raised)] px-5 py-6 text-center">
          <Sparkles className="mx-auto size-6 text-[var(--editor-muted)]" />
          <p className="mt-3 text-xs font-semibold">
            Otpremite logotip za automatski stil
          </p>
          <p className="mt-2 text-[10px] leading-4 text-[var(--editor-muted)]">
            Nakon obrade otključaćemo sve boje i ostale sekcije.
          </p>
        </div>
      )}
    </EditorPanel>
  );
}

export function BackgroundPanel({
  design,
  backgroundImageUrl,
  uploadingImage,
  onDesignChange,
  onImageUpload,
  onRemoveImage,
}: {
  design: ScanMeDesignV1;
  backgroundImageUrl: string | null;
  uploadingImage: boolean;
  onDesignChange: (design: ScanMeDesignV1) => void;
  onImageUpload: (file: File | undefined) => void;
  onRemoveImage: () => void;
}) {
  const background = design.background;

  function update(next: ScanMeBackground) {
    onDesignChange({
      ...design,
      presetKey: "custom",
      background: next,
      colors: {
        ...design.colors,
        page:
          next.kind === "solid"
            ? next.color
            : next.kind === "gradient"
              ? next.from
              : next.kind === "pattern"
                ? next.backgroundColor
                : design.colors.page,
      },
    });
  }

  function setKind(kind: ScanMeBackground["kind"]) {
    if (kind === background.kind) return;
    if (kind === "solid") {
      update({ kind, color: design.colors.page });
    } else if (kind === "gradient") {
      update({
        kind,
        from: design.colors.page,
        to: design.colors.surface,
        angle: 135,
        overlayColor: "#000000",
        overlayOpacity: 0,
      });
    } else if (kind === "pattern") {
      update({
        kind,
        pattern: "grid",
        backgroundColor: design.colors.page,
        patternColor: design.colors.border,
        opacity: 0.12,
      });
    } else {
      update({
        kind,
        fit: "cover",
        position: "center",
        overlayColor: design.colors.page,
        overlayOpacity: 0.48,
      });
    }
  }

  return (
    <EditorPanel
      title="Pozadina"
      description="Izaberite podlogu koja ističe sadržaj i ostaje čitljiva."
    >
      <SegmentedControl
        label="Vrsta pozadine"
        value={background.kind}
        onChange={setKind}
        options={[
          { value: "solid", label: "Boja" },
          { value: "gradient", label: "Gradijent" },
          { value: "pattern", label: "Šara" },
          { value: "image", label: "Slika" },
        ]}
      />

      <div className="mt-5">
        {background.kind === "solid" ? (
          <PanelSection title="Puna boja">
            <ColorRoleField
              label="Pozadina"
              value={background.color}
              onCommit={(color) => update({ kind: "solid", color })}
            />
          </PanelSection>
        ) : null}

        {background.kind === "gradient" ? (
          <>
            <PanelSection>
              <div
                className="h-24 w-full rounded-2xl border border-[var(--editor-line)] shadow-inner transition-[background]"
                style={{
                  background: `linear-gradient(${background.angle}deg, ${background.from}, ${background.to})`,
                }}
              />
            </PanelSection>

            <PanelSection title="Boje gradijenta">
              <div className="grid gap-2">
                <ColorRoleField
                  label="Prva boja"
                  value={background.from}
                  onCommit={(from) => update({ ...background, from })}
                />
                <ColorRoleField
                  label="Druga boja"
                  value={background.to}
                  onCommit={(to) => update({ ...background, to })}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  update({
                    ...background,
                    from: background.to,
                    to: background.from,
                  })
                }
                className="mt-3 h-10 w-full rounded-xl"
              >
                <ArrowLeftRight className="size-4" />
                Zameni redosled
              </Button>
            </PanelSection>

            <PanelSection title="Ugao">
              <div className="flex items-center gap-4">
                <div
                  className="relative grid size-12 shrink-0 place-items-center rounded-full border border-[var(--editor-line-strong)] bg-white"
                  title={`Ugao: ${background.angle}°`}
                >
                  <span
                    className="absolute size-2.5 rounded-full bg-[var(--editor-lime)] border border-black/30"
                    style={{
                      transform: `rotate(${background.angle}deg) translate(0, -18px)`,
                    }}
                  />
                </div>
                <div className="flex-1">
                  <RangeField
                    label="Ugao gradijenta"
                    value={background.angle}
                    min={0}
                    max={360}
                    suffix="°"
                    onChange={(angle) => update({ ...background, angle })}
                  />
                </div>
              </div>
            </PanelSection>

            <PanelSection title="Preporučeno">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { from: "#E9E5DA", to: "#E7D9E1", angle: 135 },
                  { from: "#FFFDFC", to: "#F4EBE1", angle: 160 },
                  { from: "#E4F1FF", to: "#D8EBFF", angle: 145 },
                  { from: "#EDF1E5", to: "#DBE5D8", angle: 150 },
                ].map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() =>
                      update({
                        ...background,
                        from: preset.from,
                        to: preset.to,
                        angle: preset.angle,
                      })
                    }
                    className={cn(
                      "h-14 w-full rounded-xl border border-[var(--editor-line)] transition-transform hover:scale-[1.02] hover:border-black",
                      background.from === preset.from &&
                        background.to === preset.to &&
                        "ring-2 ring-[var(--editor-lime)] border-black",
                    )}
                    style={{
                      background: `linear-gradient(${preset.angle}deg, ${preset.from}, ${preset.to})`,
                    }}
                  />
                ))}
              </div>
            </PanelSection>

            <PanelSection>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold">Blago zatamnjenje iza teksta</p>
                  <p className="mt-1 text-[10px] text-[var(--editor-muted)]">
                    Poboljšava čitljivost teksta preko pozadine.
                  </p>
                </div>
                <NativeSwitch
                  checked={background.overlayOpacity > 0}
                  onCheckedChange={(enabled) =>
                    update({ ...background, overlayOpacity: enabled ? 0.25 : 0 })
                  }
                  label="Blago zatamnjenje iza teksta"
                />
              </div>
            </PanelSection>
          </>
        ) : null}

        {background.kind === "pattern" ? (
          <>
            <PanelSection title="Šara">
              <SegmentedControl
                label="Izbor šare"
                value={background.pattern}
                onChange={(pattern) => update({ ...background, pattern })}
                options={[
                  { value: "grid", label: "Mreža" },
                  { value: "dots", label: "Tačke" },
                  { value: "waves", label: "Talasi" },
                ]}
              />
            </PanelSection>
            <PanelSection title="Boje šare">
              <div className="grid gap-2">
                <ColorRoleField
                  label="Osnova"
                  value={background.backgroundColor}
                  onCommit={(backgroundColor) =>
                    update({ ...background, backgroundColor })
                  }
                />
                <ColorRoleField
                  label="Šara"
                  value={background.patternColor}
                  onCommit={(patternColor) =>
                    update({ ...background, patternColor })
                  }
                />
              </div>
              <div className="mt-4">
                <RangeField
                  label="Intenzitet"
                  value={Math.round(background.opacity * 100)}
                  min={2}
                  max={50}
                  suffix="%"
                  onChange={(value) =>
                    update({ ...background, opacity: value / 100 })
                  }
                />
              </div>
            </PanelSection>
          </>
        ) : null}

        {background.kind === "image" ? (
          <>
            <PanelSection title="Slika">
              <label className="flex min-h-28 cursor-pointer items-center justify-center rounded-2xl border border-dashed border-[var(--editor-line-strong)] bg-[var(--editor-surface-raised)] p-4 text-center hover:border-black focus-within:ring-2 focus-within:ring-black">
                {backgroundImageUrl ? (
                  // User-supplied asset with arbitrary aspect ratio.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={backgroundImageUrl}
                    alt="Trenutna pozadinska slika"
                    className="h-24 w-full rounded-xl object-cover"
                  />
                ) : (
                  <span>
                    {uploadingImage ? (
                      <LoaderCircle className="mx-auto size-5 animate-spin" />
                    ) : (
                      <Upload className="mx-auto size-5" />
                    )}
                    <span className="mt-2 block text-xs font-semibold">
                      {uploadingImage
                        ? "Otpremanje…"
                        : "Otpremi pozadinsku sliku"}
                    </span>
                    <span className="mt-1 block text-[10px] text-[var(--editor-muted)]">
                      PNG, JPEG ili WebP do 8 MB
                    </span>
                  </span>
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  disabled={uploadingImage}
                  onChange={(event) => onImageUpload(event.target.files?.[0])}
                />
              </label>
              {backgroundImageUrl ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onRemoveImage}
                  className="mt-3 h-10 w-full rounded-xl text-[var(--editor-danger)]"
                >
                  Ukloni sliku
                </Button>
              ) : null}
            </PanelSection>
            <PanelSection title="Prikaz slike">
              <SegmentedControl
                label="Uklapanje slike"
                value={background.fit}
                onChange={(fit) => update({ ...background, fit })}
                options={[
                  { value: "cover", label: "Popuni" },
                  { value: "contain", label: "Cela slika" },
                ]}
              />
              <div className="mt-3">
                <SegmentedControl
                  label="Pozicija slike"
                  value={background.position}
                  onChange={(position) => update({ ...background, position })}
                  options={[
                    { value: "top", label: "Gore" },
                    { value: "center", label: "Sredina" },
                    { value: "bottom", label: "Dole" },
                  ]}
                />
              </div>
              <div className="mt-4">
                <ColorRoleField
                  label="Boja overlaya"
                  value={background.overlayColor}
                  onCommit={(overlayColor) =>
                    update({ ...background, overlayColor })
                  }
                />
              </div>
              <div className="mt-4">
                <RangeField
                  label="Overlay"
                  value={Math.round(background.overlayOpacity * 100)}
                  min={0}
                  max={90}
                  suffix="%"
                  onChange={(value) =>
                    update({ ...background, overlayOpacity: value / 100 })
                  }
                />
              </div>
            </PanelSection>
          </>
        ) : null}
      </div>
    </EditorPanel>
  );
}

export function ButtonsPanel({
  design,
  onDesignChange,
}: {
  design: ScanMeDesignV1;
  onDesignChange: (design: ScanMeDesignV1) => void;
}) {
  function update(
    partial: Partial<ScanMeDesignV1["buttons"]>,
  ) {
    onDesignChange({
      ...design,
      presetKey: "custom",
      buttons: { ...design.buttons, ...partial },
    });
  }

  function setButtonColor(role: "button" | "buttonText", color: string) {
    onDesignChange({
      ...design,
      presetKey: "custom",
      colors: { ...design.colors, [role]: color },
    });
  }

  const previewStyle = {
    background:
      design.buttons.variant === "solid"
        ? design.colors.button
        : design.buttons.variant === "glass"
          ? `${design.colors.button}CC`
          : "transparent",
    color: design.colors.buttonText,
    borderColor: design.colors.border,
    borderWidth: `${design.buttons.borderWidth}px`,
    borderRadius: `${design.buttons.radius}px`,
    paddingBlock: `${design.buttons.paddingY}px`,
    boxShadow:
      design.buttons.shadow === "elevated"
        ? "0 12px 30px rgb(0 0 0 / .18)"
        : design.buttons.shadow === "soft"
          ? "0 7px 18px rgb(0 0 0 / .1)"
          : "none",
  };

  return (
    <EditorPanel
      title="Dugmad"
      description="Podesite izgled i ponašanje svih linkova."
    >
      <PanelSection title="Stil">
        <div className="grid gap-2">
          {(
            [
              ["solid", "Puna", "Naglašena površina"],
              ["glass", "Staklo", "Poluprovidna površina"],
              ["outline", "Kontura", "Lagan, čist izgled"],
            ] as const
          ).map(([value, label, description]) => (
            <ChoiceCard
              key={value}
              label={`Izaberi stil ${label}`}
              selected={design.buttons.variant === value}
              onClick={() => update({ variant: value })}
              className="flex min-h-14 items-center gap-3 p-3"
            >
              <span
                className="h-8 w-20 shrink-0"
                style={{
                  borderRadius: Math.min(10, design.buttons.radius),
                  border: `${design.buttons.borderWidth || 1}px solid ${design.colors.border}`,
                  background:
                    value === "solid"
                      ? design.colors.button
                      : value === "glass"
                        ? `${design.colors.button}99`
                        : "transparent",
                }}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold">{label}</span>
                <span className="mt-0.5 block text-[10px] text-[var(--editor-muted)]">
                  {description}
                </span>
              </span>
              {design.buttons.variant === value ? (
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[var(--editor-lime)] text-black">
                  <Check className="size-3 stroke-[2.5]" />
                </span>
              ) : null}
            </ChoiceCard>
          ))}
        </div>
      </PanelSection>

      <PanelSection title="Zaobljenost">
        <RangeField
          label="Zaobljenost"
          value={design.buttons.radius}
          min={0}
          max={32}
          suffix=" px"
          onChange={(radius) => update({ radius })}
        />
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            { label: "Oštri", radius: 0, shapeClass: "rounded-none" },
            { label: "Zaobljeni", radius: 14, shapeClass: "rounded-lg" },
            { label: "Pill", radius: 28, shapeClass: "rounded-full" },
          ].map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => update({ radius: preset.radius })}
              className={cn(
                "flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--editor-line)] bg-[var(--editor-surface-raised)] transition-colors hover:border-black",
                design.buttons.radius === preset.radius &&
                  "border-black bg-[var(--editor-lime)]/30 ring-2 ring-[var(--editor-lime)]",
              )}
            >
              <span
                className={cn(
                  "size-4 border border-black/40 bg-black/15",
                  preset.shapeClass,
                )}
              />
            </button>
          ))}
        </div>
      </PanelSection>

      <PanelSection title="Animacija">
        <div className="grid grid-cols-2 gap-2">
          {[
            { value: "none", label: "Bez" },
            { value: "lift", label: "Outline" },
            { value: "liquid", label: "Liquid" },
            { value: "glow", label: "Glow" },
          ].map((item) => {
            const selected = design.buttons.animation === (item.value === "lift" ? "lift" : item.value);
            return (
              <ChoiceCard
                key={item.value}
                label={`Animacija ${item.label}`}
                selected={selected}
                onClick={() =>
                  update({
                    animation: item.value as ScanMeDesignV1["buttons"]["animation"],
                  })
                }
                className="flex flex-col items-center justify-center gap-1.5 p-3 text-center"
              >
                <span className="text-xs font-semibold">{item.label}</span>
              </ChoiceCard>
            );
          })}
        </div>
      </PanelSection>

      <PanelSection title="Boje">
        <div className="grid gap-2">
          <ColorRoleField
            label="Dugme"
            value={design.colors.button}
            onCommit={(color) => setButtonColor("button", color)}
          />
          <ColorRoleField
            label="Tekst dugmeta"
            value={design.colors.buttonText}
            onCommit={(color) => setButtonColor("buttonText", color)}
          />
        </div>
      </PanelSection>

      <PanelSection>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold">Blaga senka</p>
            <p className="mt-1 text-[10px] text-[var(--editor-muted)]">
              Dodaje blagi visinski efekat dugmadi.
            </p>
          </div>
          <NativeSwitch
            checked={design.buttons.shadow !== "none"}
            onCheckedChange={(enabled) =>
              update({ shadow: enabled ? "soft" : "none" })
            }
            label="Blaga senka"
          />
        </div>
      </PanelSection>

      <PanelSection title="Preview dugmeta">
        <div className="rounded-2xl border border-[var(--editor-line)] bg-black/[0.025] p-4">
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            className="w-full text-sm font-semibold"
            style={previewStyle}
          >
            Pogledajte portfolio
          </button>
        </div>
      </PanelSection>
    </EditorPanel>
  );
}

export function TextPanel({
  design,
  onDesignChange,
}: {
  design: ScanMeDesignV1;
  onDesignChange: (design: ScanMeDesignV1) => void;
}) {
  function update(
    partial: Partial<ScanMeDesignV1["typography"]>,
  ) {
    onDesignChange({
      ...design,
      presetKey: "custom",
      typography: { ...design.typography, ...partial },
    });
  }

  const titleContrast = wcagContrast(
    design.colors.title,
    design.colors.page,
  );
  const bodyContrast = wcagContrast(design.colors.body, design.colors.page);

  return (
    <EditorPanel
      title="Tekst"
      description="Podesite tipografiju bez komplikovanih pravila."
      footer={
        <div
          className={cn(
            "flex items-start gap-3 rounded-xl border px-3 py-3 text-xs",
            titleContrast >= 4.5 && bodyContrast >= 4.5
              ? "border-[#668f00]/40 bg-[var(--editor-lime)]/16"
              : "border-[var(--editor-danger)]/30 bg-[var(--editor-danger)]/5",
          )}
        >
          {titleContrast >= 4.5 && bodyContrast >= 4.5 ? (
            <Check className="mt-0.5 size-4 shrink-0" />
          ) : (
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
          )}
          <span>
            {titleContrast >= 4.5 && bodyContrast >= 4.5
              ? "Tekst ispunjava WCAG AA kontrast."
              : "Popravite boje teksta pre čuvanja."}
          </span>
        </div>
      }
    >
      <PanelSection title="Font">
        <Select
          value={design.typography.family}
          onValueChange={(value) =>
            update({
              family: value as ScanMeDesignV1["typography"]["family"],
            })
          }
        >
          <SelectTrigger
            aria-label="Porodica fonta"
            className="h-11 rounded-xl"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="mono">IBM Plex Mono</SelectItem>
            <SelectItem value="sans">Sistemski sans</SelectItem>
            <SelectItem value="serif">Georgia serif</SelectItem>
          </SelectContent>
        </Select>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label className="text-[10px] uppercase tracking-wider">
              Naslov
            </Label>
            <Select
              value={String(design.typography.headingWeight)}
              onValueChange={(value) =>
                update({
                  headingWeight: Number(
                    value,
                  ) as ScanMeDesignV1["typography"]["headingWeight"],
                })
              }
            >
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="400">Regular</SelectItem>
                <SelectItem value="500">Medium</SelectItem>
                <SelectItem value="600">Semibold</SelectItem>
                <SelectItem value="700">Bold</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label className="text-[10px] uppercase tracking-wider">
              Opis
            </Label>
            <Select
              value={String(design.typography.bodyWeight)}
              onValueChange={(value) =>
                update({
                  bodyWeight: Number(
                    value,
                  ) as ScanMeDesignV1["typography"]["bodyWeight"],
                })
              }
            >
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="400">Regular</SelectItem>
                <SelectItem value="500">Medium</SelectItem>
                <SelectItem value="600">Semibold</SelectItem>
                <SelectItem value="700">Bold</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-4 grid gap-2">
            <Label className="text-[10px] uppercase tracking-wider">
              Poravnanje
            </Label>
            <div
              role="group"
              aria-label="Poravnanje teksta"
              className="grid grid-cols-3 rounded-xl border border-[var(--editor-line)] p-1"
            >
              {(
                [
                  ["left", AlignLeft],
                  ["center", AlignCenter],
                  ["right", AlignRight],
                ] as const
              ).map(([value, Icon]) => (
                <button
                  key={value}
                  type="button"
                  aria-label={
                    value === "left"
                      ? "Levo poravnanje"
                      : value === "center"
                        ? "Centralno poravnanje"
                        : "Desno poravnanje"
                  }
                  aria-pressed={design.typography.alignment === value}
                  onClick={() => update({ alignment: value })}
                  className={cn(
                    "grid min-h-8 place-items-center rounded-lg",
                    design.typography.alignment === value &&
                      "bg-[var(--editor-lime)]",
                  )}
                >
                  <Icon className="size-4" />
                </button>
              ))}
            </div>
        </div>
      </PanelSection>

      <PanelSection title="Veličina i ritam">
        <SegmentedControl
          label="Veličina teksta"
          value={design.typography.scale}
          onChange={(scale) => update({ scale })}
          options={[
            { value: "small", label: "Mala" },
            { value: "medium", label: "Srednja" },
            { value: "large", label: "Velika" },
          ]}
        />
        <div className="mt-4">
          <RangeField
            label="Prored"
            value={Math.round(design.typography.lineHeight * 100)}
            min={110}
            max={180}
            suffix="%"
            onChange={(value) => update({ lineHeight: value / 100 })}
          />
        </div>
        <div className="mt-4">
          <RangeField
            label="Vertikalni razmak"
            value={design.typography.verticalSpacing}
            min={12}
            max={40}
            suffix=" px"
            onChange={(verticalSpacing) => update({ verticalSpacing })}
          />
        </div>
      </PanelSection>

      <PanelSection title="Boje teksta">
        <div className="grid gap-2">
          <ColorRoleField
            label="Naslov"
            value={design.colors.title}
            ratio={titleContrast}
            onCommit={(title) =>
              onDesignChange({
                ...design,
                presetKey: "custom",
                colors: { ...design.colors, title },
              })
            }
          />
          <ColorRoleField
            label="Opis"
            value={design.colors.body}
            ratio={bodyContrast}
            onCommit={(body) =>
              onDesignChange({
                ...design,
                presetKey: "custom",
                colors: { ...design.colors, body },
              })
            }
          />
          <ColorRoleField
            label="Tekst dugmeta"
            value={design.colors.buttonText}
            ratio={wcagContrast(
              design.colors.buttonText,
              design.colors.button,
            )}
            onCommit={(buttonText) =>
              onDesignChange({
                ...design,
                presetKey: "custom",
                colors: { ...design.colors, buttonText },
              })
            }
          />
        </div>
      </PanelSection>

      <PanelSection title="Primer">
        <div
          className={cn(
            "rounded-2xl border border-[var(--editor-line)] p-5",
            design.typography.alignment === "left"
              ? "text-left"
              : design.typography.alignment === "right"
                ? "text-right"
                : "text-center",
          )}
          style={{
            background: design.colors.page,
            fontFamily:
              design.typography.family === "mono"
                ? "var(--font-plex-mono), monospace"
                : design.typography.family === "serif"
                  ? "Georgia, serif"
                  : "Arial, sans-serif",
          }}
        >
          <p
            className="text-xl"
            style={{
              color: design.colors.title,
              fontWeight: design.typography.headingWeight,
            }}
          >
            Studio Forma
          </p>
          <p
            className="mt-2 text-xs"
            style={{
              color: design.colors.body,
              fontWeight: design.typography.bodyWeight,
              lineHeight: design.typography.lineHeight,
            }}
          >
            Dizajn enterijera · Beograd
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => update(DEFAULT_SCANME_DESIGN.typography)}
          className="mt-4 h-11 w-full rounded-xl border-[var(--editor-line-strong)] bg-[var(--editor-surface-raised)]"
        >
          <RotateCcw className="size-4" />
          Vrati podrazumevane vrednosti
        </Button>
      </PanelSection>
    </EditorPanel>
  );
}

function ColorRoleField({
  label,
  value,
  ratio,
  presetSwatches = [],
  onCommit,
}: {
  label: string;
  value: string;
  ratio?: number;
  presetSwatches?: string[];
  onCommit: (value: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  function commit(next: string) {
    const normalized = next.trim().toUpperCase();
    if (/^#[0-9A-F]{6}$/.test(normalized)) {
      onCommit(normalized);
    }
  }

  return (
    <>
      <div className="flex min-h-12 items-center gap-3 rounded-xl border border-[var(--editor-line)] bg-[var(--editor-surface-raised)] px-3">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          title={`Prikaži napredni color picker za ${label}`}
          className="relative size-7 shrink-0 overflow-hidden rounded-lg border border-black/15 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
          style={{ backgroundColor: value }}
        >
          <span className="sr-only">Izaberi boju za {label}</span>
        </button>
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium">
          {label}
        </span>
        {ratio !== undefined ? (
          <span
            className={cn(
              "text-[9px] tabular-nums",
              ratio >= 4.5
                ? "text-[#526f00]"
                : "text-[var(--editor-danger)]",
            )}
          >
            {ratio.toFixed(1)}:1
          </span>
        ) : null}
        <input
          aria-label={`HEX boja za ${label}`}
          key={value}
          defaultValue={value}
          maxLength={7}
          onBlur={(event) => {
            commit(event.currentTarget.value);
            event.currentTarget.value = value;
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              commit(event.currentTarget.value);
              event.currentTarget.blur();
            }
          }}
          className="w-[72px] bg-transparent text-right text-[10px] uppercase outline-none"
        />
      </div>

      <AdvancedColorPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        color={value}
        label={`Podešavanje boje · ${label}`}
        presetSwatches={presetSwatches}
        onSave={onCommit}
      />
    </>
  );
}

function PaletteRow({
  label,
  colors,
  presetSwatches = [],
  onColorChange,
  className,
}: {
  label: string;
  colors: string[];
  presetSwatches?: string[];
  onColorChange?: (index: number, newHex: string) => void;
  className?: string;
}) {
  const [activeColorIndex, setActiveColorIndex] = useState<number | null>(null);

  return (
    <div className={className}>
      <p className="mb-2 text-[10px] text-[var(--editor-muted)]">{label}</p>
      <div className="flex flex-wrap gap-2">
        {colors.map((color, index) => (
          <button
            key={`${color}-${index}`}
            type="button"
            onClick={() => setActiveColorIndex(index)}
            title={`Kliknite da prilagodite boju ${color}`}
            className="size-9 rounded-full border border-black/10 shadow-[inset_0_0_0_2px_rgb(255_255_255/0.5)] transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
            style={{ backgroundColor: color }}
          />
        ))}
      </div>

      {activeColorIndex !== null ? (
        <AdvancedColorPickerDialog
          open={activeColorIndex !== null}
          onOpenChange={(open) => {
            if (!open) setActiveColorIndex(null);
          }}
          color={colors[activeColorIndex] || "#000000"}
          label={`${label} · Boja #${activeColorIndex + 1}`}
          presetSwatches={presetSwatches}
          onSave={(newHex) => {
            if (onColorChange) {
              onColorChange(activeColorIndex, newHex);
            }
            setActiveColorIndex(null);
          }}
        />
      ) : null}
    </div>
  );
}

function ContrastStatus({
  issues,
  autoContrast,
  design,
}: {
  issues: ReturnType<typeof scanMeContrastIssues>;
  autoContrast: boolean;
  design?: ScanMeDesignV1;
}) {
  const ok = issues.length === 0;
  const ratio = design
    ? wcagContrast(design.colors.title, design.colors.page).toFixed(1)
    : "7.8";

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border px-4 py-3 text-xs font-medium",
        ok
          ? "border-[#668f00]/40 bg-[var(--editor-lime)] text-black"
          : "border-[var(--editor-danger)]/30 bg-[var(--editor-danger)]/10 text-[var(--editor-danger)]",
      )}
    >
      {ok ? (
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-black/10">
          <Check className="size-3.5 stroke-[2.5]" />
        </span>
      ) : (
        <CircleAlert className="size-4 shrink-0" />
      )}
      <span>
        {ok
          ? `Odličan kontrast · ${ratio}:1`
          : autoContrast
            ? "Kontrast će biti popravljen pri čuvanju."
            : `${issues.length} kombinacija ne ispunjava WCAG AA.`}
      </span>
    </div>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center justify-between gap-3 text-[11px]">
        <span>{label}</span>
        <span className="tabular-nums text-[var(--editor-muted)]">
          {value}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          onChange(Number(event.target.value))
        }
        className="h-2 w-full cursor-pointer accent-[var(--editor-lime)]"
      />
    </label>
  );
}

export function resetColorsForDesign(design: ScanMeDesignV1) {
  const preset =
    design.presetKey === "custom" ? "gentle" : design.presetKey;
  return {
    ...design,
    colors: structuredClone(PRESET_DESIGNS[preset].colors),
  };
}
