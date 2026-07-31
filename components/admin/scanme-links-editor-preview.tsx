"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  BatteryFull,
  Monitor,
  Plus,
  Smartphone,
  Wifi,
} from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  OptionTwoDestinationContent,
  OptionTwoFrame,
  optionTwoDestinationClassName,
  optionTwoDuplicateNumber,
} from "@/components/scanme-links/templates/option-two/option-two-template";
import type { ScanMeLinksViewModel } from "@/components/scanme-links/templates/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DEFAULT_ACCENT_TOKENS } from "@/lib/scanme-links";
import { cn } from "@/lib/utils";
import styles from "./scanme-links-editor.module.css";
import type {
  EditorDestination,
  PreviewDevice,
  ScanMeLinksEditorDocument,
} from "./scanme-links-editor-types";

export function ScanMeLinksEditorPreview({
  businessName,
  document,
  selectedDestinationId,
  onSelectDestination,
  onReorder,
  onAddDestination,
  addBusy,
  device,
  setDevice,
  zoom,
  setZoom,
}: {
  businessName: string;
  document: ScanMeLinksEditorDocument;
  selectedDestinationId: string | null;
  onSelectDestination: (destinationId: EditorDestination["id"]) => void;
  onReorder: (activeId: string, overId: string) => void;
  onAddDestination: () => void;
  addBusy: boolean;
  device: PreviewDevice;
  setDevice: (device: PreviewDevice) => void;
  zoom: number;
  setZoom: (zoom: number) => void;
}) {
  const reducedMotion = useReducedMotion();
  const [localTime, setLocalTime] = useState("--:--");

  useEffect(() => {
    const update = () => setLocalTime(currentTime());
    update();
    const interval = window.setInterval(update, 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const destinations = useMemo(
    () =>
      document.destinations
        .filter(
          (destination) =>
            destination.state !== "deleted" &&
            destination.state !== "archived",
        )
        .sort((a, b) => a.order - b.order),
    [document.destinations],
  );

  const view: ScanMeLinksViewModel = {
    displayName: document.title,
    description: document.description,
    logoUrl: document.logoUrl,
    templateKey: "option-two",
    backgroundKey: "warm-ivory",
    accent: document.design.colors.accent,
    accentTokens: {
      ...DEFAULT_ACCENT_TOKENS,
      accent: document.design.colors.accent,
      strong: document.design.colors.title,
      soft: document.design.colors.surface,
      border: document.design.colors.border,
      focus: document.design.colors.focus,
      onAccent: document.design.colors.buttonText,
    },
    design: document.design,
    backgroundImageUrl: document.backgroundImageUrl,
    backgroundVideoUrl: document.backgroundVideoUrl,
    destinations: destinations.map((destination) => ({
      id: destination.id,
      kind: destination.kind,
      label: destination.label,
      url: destination.url,
      iconKey: destination.iconKey,
      state: destination.state,
    })),
  };

  return (
    <section
      className={styles.previewStage}
      aria-label={`Pregled ScanMe Links stranice za ${businessName}`}
    >
      <div
        className={styles.previewToolbar}
        data-editor-preserve-panel="true"
      >
        <div className={styles.toolbarGroup} aria-label="Uređaj za pregled">
          <button
            type="button"
            className={cn(
              styles.toolbarButton,
              device === "phone" && styles.toolbarActive,
            )}
            aria-label="Prikaži mobilnu verziju"
            aria-pressed={device === "phone"}
            onClick={() => setDevice("phone")}
          >
            <Smartphone className="size-[18px]" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={cn(
              styles.toolbarButton,
              device === "desktop" && styles.toolbarActive,
            )}
            aria-label="Prikaži desktop verziju"
            aria-pressed={device === "desktop"}
            onClick={() => setDevice("desktop")}
          >
            <Monitor className="size-[18px]" aria-hidden="true" />
          </button>
        </div>
        <Select
          value={String(zoom)}
          onValueChange={(value) => setZoom(Number(value))}
        >
          <SelectTrigger
            className={styles.zoomSelect}
            aria-label="Zum pregleda"
          >
            <SelectValue>{zoom}%</SelectValue>
          </SelectTrigger>
          <SelectContent className={styles.editorSelectContent}>
            {[75, 90, 100, 110].map((value) => (
              <SelectItem
                key={value}
                value={String(value)}
                className={styles.editorSelectItem}
              >
                {value}%
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className={styles.deviceCanvas}>
        <AnimatePresence mode="wait" initial={false}>
          {device === "phone" ? (
            <motion.div
              key="phone"
              className={styles.phoneFit}
              data-editor-preserve-panel="true"
              initial={reducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reducedMotion ? undefined : { opacity: 0 }}
              transition={{ type: "spring", stiffness: 310, damping: 30 }}
            >
              <div
                className={styles.phoneShell}
                style={{ transform: `scale(${zoom / 100})` }}
              >
                <div className={styles.phoneScreen}>
                  <div className={styles.dynamicIsland} aria-hidden="true" />
                  <div className={styles.phoneStatus} aria-hidden="true">
                    <span>{localTime}</span>
                    <span className="flex items-center gap-1">
                      <SignalBars />
                      <Wifi className="size-3" strokeWidth={2.4} />
                      <BatteryFull className="size-[15px]" strokeWidth={2.2} />
                    </span>
                  </div>
                  <div className={styles.phoneContent}>
                    <InteractivePreviewPage
                      view={view}
                      destinations={destinations}
                      selectedDestinationId={selectedDestinationId}
                      onSelectDestination={onSelectDestination}
                      onReorder={onReorder}
                      onAddDestination={onAddDestination}
                      addBusy={addBusy}
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="desktop"
              className={styles.desktopShell}
              data-editor-preserve-panel="true"
              style={{ transform: `scale(${zoom / 100})` }}
              initial={reducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reducedMotion ? undefined : { opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              <div className={styles.desktopScreen}>
                <InteractivePreviewPage
                  view={view}
                  destinations={destinations}
                  selectedDestinationId={selectedDestinationId}
                  onSelectDestination={onSelectDestination}
                  onReorder={onReorder}
                  onAddDestination={onAddDestination}
                  addBusy={addBusy}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

function InteractivePreviewPage({
  view,
  destinations,
  selectedDestinationId,
  onSelectDestination,
  onReorder,
  onAddDestination,
  addBusy,
}: {
  view: ScanMeLinksViewModel;
  destinations: EditorDestination[];
  selectedDestinationId: string | null;
  onSelectDestination: (destinationId: EditorDestination["id"]) => void;
  onReorder: (activeId: string, overId: string) => void;
  onAddDestination: () => void;
  addBusy: boolean;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 7 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    onReorder(String(event.active.id), String(event.over.id));
  }

  return (
    <OptionTwoFrame view={view} preview>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={destinations.map((destination) => destination.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="grid gap-4 px-1">
            {destinations.map((destination, index) => (
              <SortablePreviewDestination
                key={destination.id}
                destination={destination}
                duplicate={optionTwoDuplicateNumber(destinations, index)}
                selected={selectedDestinationId === destination.id}
                iconStyle={view.design?.iconStyle}
                onSelect={() => onSelectDestination(destination.id)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <button
        type="button"
        className="mx-1 mt-5 flex min-h-12 w-[calc(100%-0.5rem)] items-center justify-center gap-2 rounded-2xl border border-dashed border-current/25 bg-white/20 px-4 text-xs font-semibold opacity-65 transition hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2"
        disabled={addBusy}
        onClick={onAddDestination}
      >
        <Plus className="size-4" aria-hidden="true" />
        {addBusy ? "Dodavanje…" : "Dodaj novi link"}
      </button>
    </OptionTwoFrame>
  );
}

function SortablePreviewDestination({
  destination,
  duplicate,
  selected,
  iconStyle,
  onSelect,
}: {
  destination: EditorDestination;
  duplicate: number | null;
  selected: boolean;
  iconStyle?: NonNullable<ScanMeLinksViewModel["design"]>["iconStyle"];
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
  const missingUrl =
    destination.state === "active" && !destination.url.trim();
  const inactive = destination.state === "inactive";

  const rowStyle: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 30 : undefined,
    opacity: isDragging ? 0.88 : inactive ? 0.64 : 1,
    borderStyle: inactive ? "dashed" : undefined,
    borderColor: missingUrl ? "rgba(165,67,67,.48)" : undefined,
  };

  return (
    <li ref={setNodeRef} style={rowStyle}>
      <button
        type="button"
        className={cn(
          optionTwoDestinationClassName,
          "relative w-full cursor-grab active:cursor-grabbing",
          selected && styles.previewDestinationSelected,
        )}
        {...attributes}
        {...listeners}
        data-draft-state={destination.state}
        data-missing-url={missingUrl ? "true" : undefined}
        onClick={onSelect}
        aria-label={`${destination.label}. Kliknite za uređivanje ili prevucite za promenu redosleda.`}
      >
        <OptionTwoDestinationContent
          destination={destination}
          duplicate={duplicate}
          preview
          iconStyle={iconStyle}
        />
      </button>
    </li>
  );
}

function currentTime() {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

function SignalBars() {
  return (
    <span className="flex h-3 items-end gap-px">
      {[3, 5, 7, 9].map((height) => (
        <span
          key={height}
          className="block w-[2px] rounded-full bg-current"
          style={{ height }}
        />
      ))}
    </span>
  );
}
