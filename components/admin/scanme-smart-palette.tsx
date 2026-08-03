"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  Check,
  Lock,
  Moon,
  Palette,
  PaintBucket,
  RefreshCw,
  Sun,
  Unlock,
} from "lucide-react";
import { useMemo, useRef } from "react";
import { EditorTooltip } from "@/components/admin/editor-tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { colorDisplayName } from "@/lib/color-display-name";
import {
  applyGeneratedPalette,
  applyPaletteColorToRole,
  generateScanMePalette,
  GENERATED_PALETTE_ROLES,
  inferPaletteMode,
  normalizePaletteLocks,
  type PaletteGenerationMode,
  type PaletteTargetRole,
} from "@/lib/scanme-palette";
import { cn } from "@/lib/utils";
import styles from "./scanme-links-editor.module.css";
import type {
  EditorPaletteAnalysis,
  EditorDocumentSetter,
  ScanMeLinksEditorDocument,
} from "./scanme-links-editor-types";

const paletteRoleLabels = [
  "Pozadina",
  "Površina",
  "Akcent",
  "Tekst",
  "Dugme",
] as const;

const targetRoles: Array<{ value: PaletteTargetRole; label: string }> = [
  { value: "background", label: "Pozadina" },
  { value: "surface", label: "Površina" },
  { value: "accent", label: "Akcent" },
  { value: "title", label: "Naslov" },
  { value: "body", label: "Opis" },
  { value: "button", label: "Dugme" },
  { value: "buttonText", label: "Tekst dugmeta" },
  { value: "icon", label: "Ikonica" },
  { value: "border", label: "Ivica" },
  { value: "focus", label: "Fokus" },
];

function currentAnalysis(document: ScanMeLinksEditorDocument): EditorPaletteAnalysis {
  const original = document.paletteAnalysis?.original.length
    ? document.paletteAnalysis.original
    : document.palette;
  const generationMode =
    document.paletteAnalysis?.generationMode ??
    inferPaletteMode(document.design.colors.page);
  const lockedSlots = normalizePaletteLocks(
    document.paletteAnalysis?.lockedSlots,
  );
  const adjusted =
    document.paletteAnalysis?.adjusted.length === 5
      ? document.paletteAnalysis.adjusted
      : generateScanMePalette({
          sourceColors: original,
          mode: generationMode,
          lockedSlots,
        });

  return {
    original,
    adjusted,
    correctedRoles: document.paletteAnalysis?.correctedRoles ?? [],
    generationMode,
    lockedSlots,
  };
}

export function ScanMeSmartPalette({
  document,
  setDocument,
}: {
  document: ScanMeLinksEditorDocument;
  setDocument: EditorDocumentSetter;
}) {
  const reducedMotion = useReducedMotion();
  const regenerationRef = useRef(0);
  const analysis = useMemo(() => currentAnalysis(document), [document]);
  const hasLogoPalette = analysis.original.length > 0;

  function regenerate(mode = analysis.generationMode) {
    if (!hasLogoPalette) return;
    regenerationRef.current += 1;
    setDocument(
      (current) => {
        const currentValue = currentAnalysis(current);
        return {
          ...current,
          paletteAnalysis: {
            ...currentValue,
            generationMode: mode,
            adjusted: generateScanMePalette({
              sourceColors: currentValue.original,
              mode,
              currentColors: currentValue.adjusted,
              lockedSlots: currentValue.lockedSlots,
              seed: regenerationRef.current,
            }),
            correctedRoles: [],
          },
        };
      },
    );
  }

  function setMode(mode: PaletteGenerationMode) {
    if (mode === analysis.generationMode) return;
    regenerate(mode);
  }

  function toggleLock(index: number) {
    if (index === 2 || !hasLogoPalette) return;
    setDocument(
      (current) => {
        const currentValue = currentAnalysis(current);
        return {
          ...current,
          paletteAnalysis: {
            ...currentValue,
            lockedSlots: currentValue.lockedSlots.map((locked, slot) =>
              slot === index ? !locked : locked,
            ),
          },
        };
      },
    );
  }

  function applyAll() {
    if (!hasLogoPalette) return;
    setDocument(
      (current) => {
        const currentValue = currentAnalysis(current);
        const applied = applyGeneratedPalette(
          current.design,
          currentValue.adjusted,
        );
        return {
          ...current,
          design: applied.design,
          paletteAnalysis: {
            ...currentValue,
            correctedRoles: applied.correctedRoles,
          },
        };
      },
    );
  }

  function applyOne(color: string, role: PaletteTargetRole) {
    setDocument(
      (current) => ({
        ...current,
        design: applyPaletteColorToRole(current.design, color, role),
      }),
    );
  }

  return (
    <div className={styles.smartPalette}>
      <div className={styles.smartPaletteHeader}>
        <span className={styles.smartPaletteIcon}>
          <Palette className="size-[18px]" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <strong className={styles.smartPaletteTitle}>
            Pametni predlog palete
          </strong>
          <span className={styles.smartPaletteDescription}>
            Pet skladnih uloga iz boja logotipa. Obrada ostaje u editoru.
          </span>
        </span>
      </div>

      {hasLogoPalette ? (
        <>
          <div className={styles.paletteModeRow}>
            <span className={styles.paletteModeLabel}>Režim generatora</span>
            <div className={styles.paletteModeControl}>
              {([
                ["light", "Light", Sun],
                ["dark", "Dark", Moon],
              ] as const).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  className={cn(
                    styles.paletteModeButton,
                    analysis.generationMode === value &&
                      styles.paletteModeButtonActive,
                  )}
                  aria-pressed={analysis.generationMode === value}
                  onClick={() => setMode(value)}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.generatedPaletteGrid}>
            {analysis.adjusted.map((color, index) => {
              const locked = analysis.lockedSlots[index];
              const isAnchor = index === 2;
              return (
                <motion.div
                  key={GENERATED_PALETTE_ROLES[index]}
                  layout={!reducedMotion}
                  className={styles.generatedPaletteItem}
                  transition={{ type: "spring", stiffness: 340, damping: 28 }}
                >
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className={styles.generatedSwatchButton}
                        style={{ backgroundColor: color }}
                        aria-label={`${paletteRoleLabels[index]}: ${colorDisplayName(color)}, ${color}. Izaberite gde se primenjuje.`}
                      >
                        <PaintBucket aria-hidden="true" />
                        {isAnchor ? (
                          <span className={styles.paletteAnchorBadge}>Logo</span>
                        ) : null}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      sideOffset={8}
                      className={styles.smartPaletteMenu}
                    >
                      <DropdownMenuLabel className={styles.smartPaletteMenuLabel}>
                        Primeni {color.toUpperCase()} na
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator className={styles.smartPaletteMenuSeparator} />
                      {targetRoles.map((role) => (
                        <DropdownMenuItem
                          key={role.value}
                          className={styles.smartPaletteMenuItem}
                          onSelect={() => applyOne(color, role.value)}
                        >
                          <span
                            className={styles.smartPaletteMenuSwatch}
                            style={{ backgroundColor: color }}
                          />
                          {role.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <span className={styles.paletteLockAnchor}>
                    <EditorTooltip
                      label={
                        isAnchor
                          ? "Tačna boja iz logotipa ostaje zaključana."
                          : locked
                            ? "Otključaj ovu boju"
                            : "Zaključaj ovu boju"
                      }
                    >
                      <button
                        type="button"
                        className={styles.paletteLockButton}
                        aria-label={
                          isAnchor
                            ? "Boja logotipa je zaključana"
                            : locked
                              ? `Otključaj ${paletteRoleLabels[index]}`
                              : `Zaključaj ${paletteRoleLabels[index]}`
                        }
                        aria-pressed={locked}
                        disabled={isAnchor}
                        onClick={() => toggleLock(index)}
                      >
                        {locked ? (
                          <Lock className="size-3.5" aria-hidden="true" />
                        ) : (
                          <Unlock className="size-3.5" aria-hidden="true" />
                        )}
                      </button>
                    </EditorTooltip>
                  </span>

                  <span className={styles.generatedPaletteRole}>
                    {paletteRoleLabels[index]}
                  </span>
                  <EditorTooltip
                    label={`${colorDisplayName(color)} · ${color.toUpperCase()}`}
                  >
                    <span className={styles.generatedPaletteHex}>
                      {color.toUpperCase()}
                    </span>
                  </EditorTooltip>
                </motion.div>
              );
            })}
          </div>

          <div className={styles.smartPaletteActions}>
            <button
              type="button"
              className={styles.smartPaletteSecondaryAction}
              onClick={() => regenerate()}
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              Regeneriši
            </button>
            <button
              type="button"
              className={styles.smartPalettePrimaryAction}
              onClick={applyAll}
            >
              <Check className="size-4" aria-hidden="true" />
              Primeni sve
            </button>
          </div>
        </>
      ) : (
        <p className={styles.smartPaletteEmpty}>
          Otpremite logotip da editor lokalno izdvoji boje i predloži paletu.
        </p>
      )}
    </div>
  );
}
