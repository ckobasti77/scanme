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
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Sparkles } from "lucide-react";
import type { CSSProperties } from "react";
import { TemplateIcon } from "@/components/scanme-links/template-icon";
import { scanMeButtonStyleClasses } from "@/components/scanme-links/templates/registry";
import {
  OptionTwoDestinationContent,
  OptionTwoFrame,
  optionTwoDestinationClassName,
  optionTwoDuplicateNumber,
} from "@/components/scanme-links/templates/option-two/option-two-template";
import type { ScanMeLinksViewModel } from "@/components/scanme-links/templates/types";
import type { Id } from "@/convex/_generated/dataModel";
import {
  DEFAULT_SCANME_DESIGN,
  type ScanMeDesignV1,
} from "@/lib/scanme-design";
import { cn } from "@/lib/utils";
import type {
  EditorPreviewMode,
  EditorZoom,
} from "./editor-shell";
import type { EditorDestinationDraft } from "./content-panel";

export function EditorPreviewStage({
  view,
  destinations,
  designReady,
  selectedId,
  previewMode,
  zoom,
  onSelect,
  onAdd,
  onChooseStyle,
  onReorder,
}: {
  view: ScanMeLinksViewModel;
  destinations: EditorDestinationDraft[];
  designReady: boolean;
  selectedId: Id<"serviceDestinations"> | null;
  previewMode: EditorPreviewMode;
  zoom: EditorZoom;
  onSelect: (id: Id<"serviceDestinations">) => void;
  onAdd: () => void;
  onChooseStyle: () => void;
  onReorder: (ids: Id<"serviceDestinations">[]) => Promise<void>;
}) {
  if (!designReady) {
    return <OnboardingPreview onChooseStyle={onChooseStyle} />;
  }

  const scale = zoom === "fit" ? 1 : zoom / 100;
  const isMobile = previewMode === "mobile";
  const width = isMobile ? 390 : 880;
  const estimatedHeight = isMobile ? 720 : 680;
  const scaledStyle = {
    "--preview-width": `${width}px`,
    "--preview-height": `${Math.ceil(estimatedHeight * scale)}px`,
  } as CSSProperties;

  return (
    <div
      style={scaledStyle}
      className={cn(
        "mx-auto flex min-h-[calc(100%-72px)] w-full items-start justify-center px-4 pb-10",
        isMobile ? "pt-2" : "pt-4",
      )}
    >
      <div
        className="w-full max-w-[var(--preview-width)]"
        style={{
          height: zoom === "fit" ? undefined : "var(--preview-height)",
        }}
      >
        <div
          style={{
            transform: zoom === "fit" ? undefined : `scale(${scale})`,
            transformOrigin: "top center",
          }}
          className={cn(
            "relative mx-auto overflow-hidden border border-black/80 bg-black shadow-[0_30px_90px_rgba(0,0,0,0.25)] transition-all",
            isMobile
              ? "max-w-[390px] rounded-[42px] border-[8px] p-1.5"
              : "w-full rounded-[24px] border-[6px] p-1.5",
          )}
        >
          {isMobile ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-3.5 z-30 flex h-4 w-24 -translate-x-1/2 items-center justify-between rounded-full bg-black px-2.5 shadow-inner ring-1 ring-white/10"
            >
              <span className="size-2 rounded-full border border-white/20 bg-neutral-900" />
              <span className="size-1.5 rounded-full border border-[#7cc200]/40 bg-[#3d7a00]" />
            </div>
          ) : null}

          <SortablePreview
            key={destinations
              .map(
                (destination) =>
                  `${destination.id}:${destination.order}:${destination.state}:${destination.presentation}`,
              )
              .join("|")}
            view={view}
            destinations={destinations}
            selectedId={selectedId}
            onSelect={onSelect}
            onAdd={onAdd}
            onReorder={onReorder}
          />
        </div>
        <p className="mt-4 flex items-center justify-center gap-2 text-[10px] font-medium text-[var(--editor-muted)]">
          <span className="size-2 animate-pulse rounded-full bg-[var(--editor-lime)]" />
          Pregled se ažurira uživo
        </p>
      </div>
    </div>
  );
}

function OnboardingPreview({
  onChooseStyle,
}: {
  onChooseStyle: () => void;
}) {
  return (
    <div className="mx-auto grid min-h-[calc(100%-72px)] w-full max-w-3xl place-items-center px-5 pb-20">
      <section className="w-full rounded-[24px] border border-dashed border-[var(--editor-line-strong)] bg-[var(--editor-surface-raised)] px-6 py-14 text-center sm:px-10">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[var(--editor-lime)]">
          <Sparkles className="size-6" />
        </span>
        <h2 className="mt-6 text-xl font-semibold tracking-[-0.04em]">
          Započnite dizajn stranice
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[var(--editor-muted)]">
          Izaberite početni stil ili otpremite logotip da bismo napravili
          pristupačnu paletu vašeg brenda.
        </p>
        <button
          type="button"
          onClick={onChooseStyle}
          className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-black px-5 text-sm font-semibold text-white transition-colors hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
        >
          <Sparkles className="size-4" />
          Izaberite početni stil
        </button>
      </section>
    </div>
  );
}

function SortablePreview({
  view,
  destinations,
  selectedId,
  onSelect,
  onAdd,
  onReorder,
}: {
  view: ScanMeLinksViewModel;
  destinations: EditorDestinationDraft[];
  selectedId: Id<"serviceDestinations"> | null;
  onSelect: (id: Id<"serviceDestinations">) => void;
  onAdd: () => void;
  onReorder: (ids: Id<"serviceDestinations">[]) => Promise<void>;
}) {
  const active = destinations
    .filter((destination) => destination.state === "active")
    .sort((first, second) => first.order - second.order);
  const activeIds = active.map((destination) => destination.id);
  const viewById = new Map(
    view.destinations.map((destination) => [destination.id, destination]),
  );
  const orderedView = active
    .map((destination) => viewById.get(destination.id))
    .filter(
      (
        destination,
      ): destination is ScanMeLinksViewModel["destinations"][number] =>
        Boolean(destination),
    );
  const buttonDestinations = active.filter(
    (destination) => destination.presentation !== "social",
  );
  const socialDestinations = active.filter(
    (destination) => destination.presentation === "social",
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const design = view.design ?? DEFAULT_SCANME_DESIGN;

  function onDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    const oldIndex = activeIds.indexOf(
      event.active.id as Id<"serviceDestinations">,
    );
    const newIndex = activeIds.indexOf(
      event.over.id as Id<"serviceDestinations">,
    );
    if (oldIndex < 0 || newIndex < 0) return;
    const movedActiveIds = arrayMove(activeIds, oldIndex, newIndex);
    const activeById = new Map(
      active.map((destination) => [destination.id, destination]),
    );
    const movedActive = movedActiveIds
      .map((id) => activeById.get(id))
      .filter(
        (destination): destination is EditorDestinationDraft =>
          Boolean(destination),
      );
    let activeIndex = 0;
    const merged = [...destinations]
      .sort((first, second) => first.order - second.order)
      .map((destination) =>
        destination.state === "active"
          ? movedActive[activeIndex++]
          : destination,
      );
    void onReorder(merged.map((destination) => destination.id));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext
        items={activeIds}
        strategy={verticalListSortingStrategy}
      >
        <OptionTwoFrame view={view} preview>
          {active.length ? (
            <>
              {buttonDestinations.length ? (
                <ul className="grid gap-4">
                  {buttonDestinations.map((destination) => {
                    const viewDestination = viewById.get(destination.id);
                    if (!viewDestination) return null;
                    const viewIndex = orderedView.findIndex(
                      (candidate) => candidate.id === destination.id,
                    );
                    return (
                      <SortableButtonDestination
                        key={destination.id}
                        destination={viewDestination}
                        duplicate={optionTwoDuplicateNumber(
                          orderedView,
                          viewIndex,
                        )}
                        design={design}
                        selected={selectedId === destination.id}
                        onSelect={() => onSelect(destination.id)}
                      />
                    );
                  })}
                </ul>
              ) : null}
              {socialDestinations.length ? (
                <ul className="mt-5 flex flex-wrap justify-center gap-3">
                  {socialDestinations.map((destination) => {
                    const viewDestination = viewById.get(destination.id);
                    return viewDestination ? (
                      <SortableSocialDestination
                        key={destination.id}
                        id={destination.id}
                        iconKey={viewDestination.iconKey}
                        label={viewDestination.label}
                        selected={selectedId === destination.id}
                        onSelect={() => onSelect(destination.id)}
                      />
                    ) : null;
                  })}
                </ul>
              ) : null}
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--links-accent-border)] bg-white/55 px-5 py-7 text-center">
              <p className="text-sm font-semibold">Dodajte prvi link</p>
              <p className="mt-2 text-xs leading-5 text-[#5d6063]">
                Linkovi se ovde prikazuju čim ih uključite.
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={onAdd}
            className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--links-accent-border)] bg-white/45 text-sm font-semibold text-[#313431] transition-colors hover:bg-white/75 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--links-accent-soft)]"
          >
            <Plus className="size-5" />
            Dodaj novi link
          </button>
        </OptionTwoFrame>
      </SortableContext>
    </DndContext>
  );
}

function SortableButtonDestination({
  destination,
  duplicate,
  design,
  selected,
  onSelect,
}: {
  destination: ScanMeLinksViewModel["destinations"][number];
  duplicate: number | null;
  design: ScanMeDesignV1;
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
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(isDragging && "relative z-20")}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-pressed={selected}
        aria-label={`${destination.label}. Kliknite za uređivanje ili prevucite da promenite redosled.`}
        onClick={onSelect}
        className={cn(
          optionTwoDestinationClassName,
          scanMeButtonStyleClasses(design),
          "cursor-grab active:cursor-grabbing",
          selected &&
            "ring-4 ring-[var(--links-accent-soft)] ring-offset-2 ring-offset-[var(--scanme-page,#f8f5ef)]",
          isDragging && "shadow-[0_22px_50px_rgb(0_0_0/0.24)]",
        )}
      >
        <span className="sr-only">
          <GripVertical className="size-4" />
          Promeni redosled
        </span>
        <OptionTwoDestinationContent
          destination={destination}
          duplicate={duplicate}
        />
      </button>
    </li>
  );
}

function SortableSocialDestination({
  id,
  iconKey,
  label,
  selected,
  onSelect,
}: {
  id: Id<"serviceDestinations">;
  iconKey: string;
  label: string;
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
  } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`${label}. Kliknite za uređivanje ili prevucite da promenite redosled.`}
        aria-pressed={selected}
        onClick={onSelect}
        className={cn(
          "grid size-12 cursor-grab place-items-center rounded-full border border-[var(--scanme-border,var(--links-accent-border))] bg-[var(--scanme-surface,#fff)] text-[var(--scanme-button-text,#202428)] shadow-sm",
          "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--links-accent-soft)]",
          selected && "ring-4 ring-[var(--links-accent-soft)]",
          isDragging && "relative z-20 opacity-80",
        )}
      >
        <TemplateIcon iconKey={iconKey} className="size-5" />
      </button>
    </li>
  );
}
