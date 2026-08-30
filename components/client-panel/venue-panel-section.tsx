"use client";

// TASK-13 — the Venue section of the client panel: where an owner RUNS Venue
// week to week. It renders ONLY when clientPanel.venuePanel returns "available"
// (an active scanme_venue profile). Every action calls a convex/venue.ts
// mutation; this file adds no lifecycle logic and duplicates no server
// validation — server refusals surface verbatim as their Serbian ConvexError
// sentences. Every string is routed through the typed dictionary
// (lib/i18n/sr/venue-panel).
//
// STEP 3 — legibility. The single hardest thing in this product is the gap
// between *saved*, *published*, and *live*. The panel answers one question at a
// glance — "are visitors seeing my latest work, and if not, what do I press?" —
// with a tone-coloured banner + a visibility chip derived purely from the
// event's (status, hasUnpublishedChanges, hasPublishedDesign) triple.

import { ConvexError } from "convex/values";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  Archive,
  CalendarClock,
  CalendarPlus,
  CircleAlert,
  CircleCheck,
  Copy,
  ExternalLink,
  EyeOff,
  LoaderCircle,
  LogOut,
  PencilLine,
  Plus,
  RefreshCw,
  Send,
  Square,
} from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
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
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { fmt } from "@/lib/i18n";
import { venuePanelSr as dict } from "@/lib/i18n/sr/venue-panel";

type VenuePanelData = Extract<
  FunctionReturnType<typeof api.clientPanel.venuePanel>,
  { status: "available" }
>;
type EventSummary = NonNullable<VenuePanelData["activeEvent"]>;
type EventStatus = EventSummary["status"];

const BELGRADE = "Europe/Belgrade";

const STATUS_LABEL: Record<EventStatus, string> = {
  draft: dict.statusDraft,
  scheduled: dict.statusScheduled,
  live: dict.statusLive,
  ended: dict.statusEnded,
  archived: dict.statusArchived,
};

const dateTimeFormat = new Intl.DateTimeFormat("sr-Latn-RS", {
  timeZone: BELGRADE,
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const dateOnlyFormat = new Intl.DateTimeFormat("sr-Latn-RS", {
  timeZone: BELGRADE,
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatBelgrade(epoch: number | null): string {
  return epoch === null ? "" : dateTimeFormat.format(new Date(epoch));
}
function formatBelgradeDate(epoch: number | null): string {
  return epoch === null ? "" : dateOnlyFormat.format(new Date(epoch));
}

// Europe/Belgrade offset (ms) at a given instant — DST-correct (CET/CEST).
function belgradeOffsetMs(instant: number): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: BELGRADE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, number> = {};
  for (const part of dtf.formatToParts(new Date(instant))) {
    if (part.type !== "literal") map[part.type] = Number(part.value);
  }
  const asUTC = Date.UTC(
    map.year,
    map.month - 1,
    map.day,
    map.hour,
    map.minute,
    map.second,
  );
  return asUTC - instant;
}

// A Belgrade wall-clock "YYYY-MM-DDTHH:mm" (from <input type="datetime-local">)
// → epoch ms, correct across the DST boundary (two-pass offset refinement).
function belgradeLocalToEpoch(local: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const utcGuess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const offset = belgradeOffsetMs(utcGuess);
  let epoch = utcGuess - offset;
  const refined = belgradeOffsetMs(epoch);
  if (refined !== offset) epoch = utcGuess - refined;
  return epoch;
}

// epoch ms → Belgrade wall-clock string for prefilling <input datetime-local>.
function epochToBelgradeLocal(epoch: number): string {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: BELGRADE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const part of dtf.formatToParts(new Date(epoch))) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`;
}

// Presentation-only: derive a URL-safe slug from a human title. The server is
// the sole authority (requireSlug) — this only saves the owner from typing one.
function slugify(input: string): string {
  const map: Record<string, string> = {
    č: "c",
    ć: "c",
    š: "s",
    ž: "z",
    đ: "dj",
  };
  return input
    .toLowerCase()
    .replace(/[čćšžđ]/g, (ch) => map[ch] ?? ch)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ConvexError && typeof error.data === "string") {
    return error.data;
  }
  return error instanceof Error ? error.message : fallback;
}

// --- STEP 3: state → legibility -------------------------------------------

type BannerTone = "ok" | "warn" | "info" | "neutral";
type Visibility = "visible" | "hidden" | "unpublished";

type BannerModel = {
  tone: BannerTone;
  title: string;
  body: string;
  visibility: Visibility;
};

// The whole legibility model in one place: given the event's (status,
// hasUnpublishedChanges, hasPublishedDesign) triple, what does the owner see?
function deriveBanner(event: EventSummary): BannerModel {
  switch (event.status) {
    case "live":
      return event.hasUnpublishedChanges
        ? {
            tone: "warn",
            title: dict.bannerLiveStaleTitle,
            body: dict.bannerLiveStaleBody,
            visibility: "unpublished",
          }
        : {
            tone: "ok",
            title: dict.bannerLiveCurrentTitle,
            body: dict.bannerLiveCurrentBody,
            visibility: "visible",
          };
    case "scheduled":
      return event.hasUnpublishedChanges
        ? {
            tone: "warn",
            title: dict.bannerScheduledStaleTitle,
            body: dict.bannerScheduledStaleBody,
            visibility: "unpublished",
          }
        : {
            tone: "info",
            title: fmt(dict.bannerScheduledTitle, {
              date: formatBelgrade(event.startsAt),
            }),
            body: dict.bannerScheduledBody,
            visibility: "visible",
          };
    case "draft":
      return event.hasPublishedDesign
        ? {
            tone: "info",
            title: dict.bannerPublishedUnscheduledTitle,
            body: dict.bannerPublishedUnscheduledBody,
            visibility: "hidden",
          }
        : {
            tone: "neutral",
            title: dict.bannerDraftTitle,
            body: dict.bannerDraftBody,
            visibility: "hidden",
          };
    case "ended":
    case "archived":
      return {
        tone: "neutral",
        title: dict.bannerEndedTitle,
        body: dict.bannerEndedBody,
        visibility: "hidden",
      };
  }
}

const BANNER_TONE_CLASS: Record<BannerTone, string> = {
  ok: "border-primary/40 bg-primary/5",
  warn: "border-amber-500/50 bg-amber-500/10",
  info: "border-sky-500/40 bg-sky-500/10",
  neutral: "border-border bg-secondary/40",
};

function BannerIcon({ tone }: { tone: BannerTone }) {
  if (tone === "ok") return <CircleCheck className="size-5 text-primary" />;
  if (tone === "warn")
    return <CircleAlert className="size-5 text-amber-600 dark:text-amber-400" />;
  if (tone === "info")
    return <CalendarClock className="size-5 text-sky-600 dark:text-sky-400" />;
  return <EyeOff className="size-5 text-muted-foreground" />;
}

function VisibilityChip({ visibility }: { visibility: Visibility }) {
  const config: Record<
    Visibility,
    { label: string; className: string; icon: ReactNode }
  > = {
    visible: {
      label: dict.chipVisible,
      className: "border-primary/40 bg-primary/10 text-primary",
      icon: <CircleCheck className="size-3.5" />,
    },
    unpublished: {
      label: dict.chipUnpublished,
      className:
        "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      icon: <CircleAlert className="size-3.5" />,
    },
    hidden: {
      label: dict.chipHidden,
      className: "border-border bg-secondary/50 text-muted-foreground",
      icon: <EyeOff className="size-3.5" />,
    },
  };
  const c = config[visibility];
  return (
    <span
      className={`inline-flex min-h-7 items-center gap-1.5 border px-2.5 text-xs font-semibold ${c.className}`}
    >
      {c.icon}
      {c.label}
    </span>
  );
}

function StatusBadge({ status }: { status: EventStatus }) {
  return (
    <span className="inline-flex min-h-7 items-center gap-1.5 border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground">
      <CalendarClock className="size-3.5" />
      {STATUS_LABEL[status]}
    </span>
  );
}

// --- Reusable "name a new event" dialog (create + duplicate) --------------

function NameEventDialog({
  open,
  onOpenChange,
  title,
  body,
  defaultTitle,
  confirmLabel,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: string;
  defaultTitle: string;
  confirmLabel: string;
  onSubmit: (slug: string, title: string) => Promise<void>;
}) {
  const [titleValue, setTitleValue] = useState(defaultTitle);
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugValue, setSlugValue] = useState(slugify(defaultTitle));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveSlug = slugTouched ? slugValue : slugify(titleValue);

  async function submit() {
    setError(null);
    const cleanTitle = titleValue.trim();
    const cleanSlug = slugify(effectiveSlug);
    if (!cleanTitle) {
      setError(dict.createSlugEmptyError);
      return;
    }
    if (!cleanSlug) {
      setError(dict.createSlugEmptyError);
      return;
    }
    setPending(true);
    try {
      await onSubmit(cleanSlug, cleanTitle);
      onOpenChange(false);
    } catch (reason) {
      setError(errorMessage(reason, dict.createError));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={pending ? undefined : onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="leading-6">{body}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="venue-new-title">{dict.createTitleLabel}</Label>
            <Input
              id="venue-new-title"
              value={titleValue}
              placeholder={dict.createTitlePlaceholder}
              onChange={(e) => setTitleValue(e.target.value)}
              className="h-11"
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="venue-new-slug">{dict.createSlugLabel}</Label>
            <Input
              id="venue-new-slug"
              value={effectiveSlug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlugValue(e.target.value);
              }}
              className="h-11 font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              {fmt(dict.createSlugHint, { slug: slugify(effectiveSlug) || "…" })}
            </p>
          </div>
          {error ? (
            <p role="alert" className="text-sm leading-6 text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={pending}>
              {dict.createCancel}
            </Button>
          </DialogClose>
          <Button onClick={() => void submit()} disabled={pending}>
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Schedule dialog -------------------------------------------------------

function ScheduleDialog({
  open,
  onOpenChange,
  event,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: EventSummary;
  onSubmit: (startsAt: number, endsAt: number) => Promise<void>;
}) {
  const [start, setStart] = useState(
    event.startsAt ? epochToBelgradeLocal(event.startsAt) : "",
  );
  const [end, setEnd] = useState(
    event.endsAt ? epochToBelgradeLocal(event.endsAt) : "",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const startsAt = belgradeLocalToEpoch(start);
    const endsAt = belgradeLocalToEpoch(end);
    if (startsAt === null || endsAt === null) {
      setError(dict.scheduleMissingTimes);
      return;
    }
    setPending(true);
    try {
      await onSubmit(startsAt, endsAt);
      onOpenChange(false);
    } catch (reason) {
      setError(errorMessage(reason, dict.scheduleError));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={pending ? undefined : onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{dict.scheduleDialogTitle}</DialogTitle>
          <DialogDescription className="leading-6">
            {dict.scheduleDialogBody}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="venue-schedule-start">
              {dict.scheduleStartLabel}
            </Label>
            <Input
              id="venue-schedule-start"
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="h-11"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="venue-schedule-end">{dict.scheduleEndLabel}</Label>
            <Input
              id="venue-schedule-end"
              type="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="h-11"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {dict.scheduleTimezoneNote}
          </p>
          {error ? (
            <p role="alert" className="text-sm leading-6 text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={pending}>
              {dict.scheduleCancel}
            </Button>
          </DialogClose>
          <Button onClick={() => void submit()} disabled={pending}>
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {dict.scheduleConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Generic confirm dialog (publish / end / archive) ----------------------

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  note,
  confirmLabel,
  cancelLabel,
  destructive,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: string;
  note?: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  onConfirm: () => Promise<void>;
}) {
  const [pending, setPending] = useState(false);

  async function confirm() {
    setPending(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={pending ? undefined : onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="leading-6">{body}</DialogDescription>
        </DialogHeader>
        {note ? (
          <p className="border-l-2 border-border pl-3 text-sm leading-6 text-muted-foreground">
            {note}
          </p>
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={pending}>
              {cancelLabel}
            </Button>
          </DialogClose>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={() => void confirm()}
            disabled={pending}
          >
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- The section ----------------------------------------------------------

type DialogKind = "create" | "duplicate" | "schedule" | "publish" | "end" | "archive";

export function VenuePanelSection({
  slug,
  data,
  onSignOut,
}: {
  slug: string;
  data: VenuePanelData;
  onSignOut: () => void;
}) {
  const createEvent = useMutation(api.venue.createEvent);
  const duplicateEvent = useMutation(api.venue.duplicateEvent);
  const scheduleEvent = useMutation(api.venue.scheduleEvent);
  const publishDraft = useMutation(api.venue.publishDraft);
  const endEventNow = useMutation(api.venue.endEventNow);
  const archiveEvent = useMutation(api.venue.archiveEvent);

  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [publishConflict, setPublishConflict] = useState<string | null>(null);

  const { activeEvent, needsArchive, pastEvents, duplicateSource } = data;
  const editorHref = `/${encodeURIComponent(slug)}/venue/editor`;
  const publicHref = `/${encodeURIComponent(slug)}/venue`;
  const eventPublicHref = (eventSlug: string) =>
    `/${encodeURIComponent(slug)}/venue/${encodeURIComponent(eventSlug)}`;

  const hasAnyEvent = activeEvent !== null || pastEvents.length > 0;

  async function runDuplicate(sourceId: Id<"events">, slugValue: string, title: string) {
    await duplicateEvent({ sourceEventId: sourceId, slug: slugValue, title });
    toast.success(dict.duplicateSuccess);
  }

  async function runPublish() {
    if (!activeEvent) return;
    try {
      await publishDraft({
        eventId: activeEvent.id,
        expectedDraftRevision: activeEvent.draftRevision,
      });
      toast.success(dict.publishSuccess);
    } catch (reason) {
      // Revision mismatch (or any publish refusal): show the conflict path with
      // the server's own sentence and a reload button.
      setPublishConflict(errorMessage(reason, dict.publishConflictBody));
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-5 border-b border-border pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            {dict.eyebrow}
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">
            {data.businessName}
          </h1>
        </div>
        <Button variant="outline" onClick={onSignOut}>
          <LogOut className="size-4" /> {dict.signOut}
        </Button>
      </div>

      {!hasAnyEvent || !activeEvent ? (
        <EmptyState onCreate={() => setDialog("create")} />
      ) : (
        <div className="mt-7 grid gap-6">
          <CurrentEvent
            event={activeEvent}
            editorHref={editorHref}
            publicHref={publicHref}
            onPublish={() => setDialog("publish")}
            onSchedule={() => setDialog("schedule")}
            onEnd={() => setDialog("end")}
            onArchive={() => setDialog("archive")}
          />

          {needsArchive ? (
            <section className="border border-amber-500/40 bg-amber-500/5 p-5">
              <h3 className="flex items-center gap-2 font-semibold">
                <Archive className="size-4 text-amber-600 dark:text-amber-400" />
                {dict.needsArchiveTitle}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {dict.needsArchiveBody}
              </p>
              <p className="mt-3 text-sm font-medium">{needsArchive.title}</p>
            </section>
          ) : null}

          {/* The weekly path: duplicate the last published design is the hero. */}
          <NextEventActions
            duplicateSource={duplicateSource}
            onDuplicate={() => setDialog("duplicate")}
            onCreate={() => setDialog("create")}
          />

          <PastEvents
            events={pastEvents.filter((e) => e.id !== activeEvent.id)}
            eventPublicHref={eventPublicHref}
          />
        </div>
      )}

      {/* Dialogs */}
      {dialog === "create" ? (
        <NameEventDialog
          open
          onOpenChange={(o) => setDialog(o ? "create" : null)}
          title={dict.createDialogTitle}
          body={dict.createDialogBody}
          defaultTitle=""
          confirmLabel={dict.createConfirm}
          onSubmit={async (slugValue, title) => {
            await createEvent({
              venueProfileId: data.venueProfileId,
              slug: slugValue,
              title,
            });
            toast.success(dict.createSuccess);
          }}
        />
      ) : null}

      {dialog === "duplicate" && duplicateSource ? (
        <NameEventDialog
          open
          onOpenChange={(o) => setDialog(o ? "duplicate" : null)}
          title={dict.duplicateDialogTitle}
          body={fmt(dict.duplicateDialogBody, { title: duplicateSource.title })}
          defaultTitle={duplicateSource.title}
          confirmLabel={dict.duplicateAction}
          onSubmit={(slugValue, title) =>
            runDuplicate(duplicateSource.id, slugValue, title)
          }
        />
      ) : null}

      {dialog === "schedule" && activeEvent ? (
        <ScheduleDialog
          open
          onOpenChange={(o) => setDialog(o ? "schedule" : null)}
          event={activeEvent}
          onSubmit={async (startsAt, endsAt) => {
            await scheduleEvent({ eventId: activeEvent.id, startsAt, endsAt });
            toast.success(dict.scheduleSuccess);
          }}
        />
      ) : null}

      {dialog === "publish" && activeEvent ? (
        <ConfirmDialog
          open
          onOpenChange={(o) => setDialog(o ? "publish" : null)}
          title={dict.publishDialogTitle}
          body={dict.publishDialogBody}
          confirmLabel={dict.publishConfirm}
          cancelLabel={dict.createCancel}
          onConfirm={runPublish}
        />
      ) : null}

      {dialog === "end" && activeEvent ? (
        <ConfirmDialog
          open
          onOpenChange={(o) => setDialog(o ? "end" : null)}
          title={dict.endDialogTitle}
          body={dict.endDialogBody}
          confirmLabel={dict.endConfirm}
          cancelLabel={dict.endCancel}
          destructive
          onConfirm={async () => {
            try {
              await endEventNow({ eventId: activeEvent.id });
              toast.success(dict.endSuccess);
            } catch (reason) {
              toast.error(errorMessage(reason, dict.endError));
            }
          }}
        />
      ) : null}

      {dialog === "archive" && activeEvent ? (
        <ConfirmDialog
          open
          onOpenChange={(o) => setDialog(o ? "archive" : null)}
          title={dict.archiveDialogTitle}
          body={dict.archiveDialogBody}
          note={dict.archivePhotosNote}
          confirmLabel={dict.archiveConfirm}
          cancelLabel={dict.archiveCancel}
          destructive
          onConfirm={async () => {
            try {
              await archiveEvent({ eventId: activeEvent.id });
              toast.success(dict.archiveSuccess);
            } catch (reason) {
              toast.error(errorMessage(reason, dict.archiveError));
            }
          }}
        />
      ) : null}

      {/* Publish revision-conflict path */}
      <Dialog
        open={publishConflict !== null}
        onOpenChange={(o) => (o ? null : setPublishConflict(null))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dict.publishConflictTitle}</DialogTitle>
            <DialogDescription className="leading-6">
              {publishConflict ?? dict.publishConflictBody}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{dict.createCancel}</Button>
            </DialogClose>
            <Button onClick={() => window.location.reload()}>
              <RefreshCw className="size-4" />
              {dict.publishConflictReload}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="mt-7 border border-border bg-card p-6 sm:p-10">
      <CalendarPlus className="size-8 text-primary" />
      <h2 className="mt-6 text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">
        {dict.emptyTitle}
      </h2>
      <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
        {dict.emptyBody}
      </p>
      <Button className="mt-7" onClick={onCreate}>
        <Plus className="size-4" />
        {dict.createEventAction}
      </Button>
    </section>
  );
}

function CurrentEvent({
  event,
  editorHref,
  publicHref,
  onPublish,
  onSchedule,
  onEnd,
  onArchive,
}: {
  event: EventSummary;
  editorHref: string;
  publicHref: string;
  onPublish: () => void;
  onSchedule: () => void;
  onEnd: () => void;
  onArchive: () => void;
}) {
  const banner = deriveBanner(event);
  const isPast = event.status === "ended" || event.status === "archived";

  return (
    <section className="border border-border bg-card">
      {/* STEP 3 — the legibility banner */}
      <div
        className={`flex items-start gap-3 border-b p-5 ${BANNER_TONE_CLASS[banner.tone]}`}
      >
        <span className="mt-0.5 shrink-0">
          <BannerIcon tone={banner.tone} />
        </span>
        <div>
          <p className="font-semibold leading-6">{banner.title}</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {banner.body}
          </p>
        </div>
      </div>

      <div className="p-5 sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {dict.currentEventHeading}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-semibold tracking-[-0.04em]">
            {event.title}
          </h2>
          <StatusBadge status={event.status} />
          <VisibilityChip visibility={banner.visibility} />
        </div>

        {/* Schedule window */}
        <dl className="mt-5 grid gap-3 border border-border sm:grid-cols-2">
          <div className="border-b border-border p-4 sm:border-b-0 sm:border-r">
            <dt className="text-xs text-muted-foreground">
              {isPast ? dict.ranLabel : dict.goesLiveLabel}
            </dt>
            <dd className="mt-1 font-medium tabular-nums">
              {event.startsAt !== null
                ? formatBelgrade(event.startsAt)
                : dict.notScheduledLabel}
            </dd>
          </div>
          <div className="p-4">
            <dt className="text-xs text-muted-foreground">{dict.endsLabel}</dt>
            <dd className="mt-1 font-medium tabular-nums">
              {event.endsAt !== null ? formatBelgrade(event.endsAt) : "—"}
            </dd>
          </div>
        </dl>

        {/* Actions — the primary is state-dependent */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {/* Publish is primary whenever the draft is ahead of the public page. */}
          {event.hasUnpublishedChanges && !isPast ? (
            <Button onClick={onPublish}>
              <Send className="size-4" />
              {dict.publishAction}
            </Button>
          ) : null}

          {/* Schedule / reschedule for editable events. */}
          {event.status === "draft" || event.status === "scheduled" ? (
            <Button
              variant={
                event.status === "draft" && event.hasPublishedDesign
                  ? "default"
                  : "outline"
              }
              onClick={onSchedule}
            >
              <CalendarClock className="size-4" />
              {event.status === "scheduled"
                ? dict.rescheduleAction
                : dict.scheduleAction}
            </Button>
          ) : null}

          {/* Edit — hidden for ended/archived (duplicate is the flow instead). */}
          {!isPast ? (
            <Button
              asChild
              variant={
                !event.hasUnpublishedChanges &&
                !(event.status === "draft" && event.hasPublishedDesign)
                  ? "default"
                  : "outline"
              }
            >
              <Link href={editorHref} target="_blank" rel="noopener noreferrer">
                <PencilLine className="size-4" />
                {dict.editAction}
              </Link>
            </Button>
          ) : null}

          {/* End now — only while live. */}
          {event.status === "live" ? (
            <Button variant="outline" onClick={onEnd}>
              <Square className="size-4" />
              {dict.endNowAction}
            </Button>
          ) : null}

          {/* Archive — only once ended. */}
          {event.status === "ended" ? (
            <Button variant="destructive" onClick={onArchive}>
              <Archive className="size-4" />
              {dict.archiveAction}
            </Button>
          ) : null}

          <Button asChild variant="ghost">
            <Link href={publicHref} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-4" />
              {dict.openPublicAction}
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function NextEventActions({
  duplicateSource,
  onDuplicate,
  onCreate,
}: {
  duplicateSource: VenuePanelData["duplicateSource"];
  onDuplicate: () => void;
  onCreate: () => void;
}) {
  return (
    <section className="border border-border bg-card p-5 sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-semibold">{dict.duplicateAction}</h3>
          <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
            {duplicateSource
              ? fmt(dict.duplicateDialogBody, { title: duplicateSource.title })
              : dict.duplicateNoSource}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          {/* The weekly hero button — copy last week's design into a new draft. */}
          <Button onClick={onDuplicate} disabled={!duplicateSource}>
            <Copy className="size-4" />
            {duplicateSource
              ? fmt(dict.duplicateNamedAction, { title: duplicateSource.title })
              : dict.duplicateAction}
          </Button>
          <Button variant="outline" onClick={onCreate}>
            <Plus className="size-4" />
            {dict.createEventAction}
          </Button>
        </div>
      </div>
    </section>
  );
}

function PastEvents({
  events,
  eventPublicHref,
}: {
  events: EventSummary[];
  eventPublicHref: (slug: string) => string;
}) {
  return (
    <section className="border border-border bg-card p-5 sm:p-7">
      <h3 className="font-semibold">{dict.pastEventsHeading}</h3>
      {events.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {dict.pastEventsEmpty}
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border border-y border-border">
          {events.map((event) => (
            <li
              key={event.id}
              className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium">{event.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {STATUS_LABEL[event.status]}
                  {event.status === "archived" && event.archivedAt
                    ? ` · ${fmt(dict.pastEventArchivedOn, {
                        date: formatBelgradeDate(event.archivedAt),
                      })}`
                    : event.endsAt
                      ? ` · ${formatBelgradeDate(event.endsAt)}`
                      : ""}
                </p>
              </div>
              {event.hasPublishedDesign ? (
                <Button asChild variant="ghost" size="sm">
                  <Link
                    href={eventPublicHref(event.slug)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="size-4" />
                    {dict.pastEventViewAction}
                  </Link>
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
