"use client";

// TASK-18 STEP 4 & 5 — the Memories section of the client panel: where the host
// RUNS a space. It renders ONLY when clientPanel.memoriesPanel returns
// "available" (an active scanme_memories profile). Every action calls a
// convex/memoriesHost.ts or convex/cards.ts mutation; this file adds no
// enforcement and duplicates no server validation — refusals surface verbatim
// as their Serbian ConvexError sentences. Every string routes through the typed
// dictionary (memories-panel).
//
// The two visibility switches are the heart of the screen: the host is deciding
// who sees guests' photos, so each carries one plain sentence saying what
// turning it ON does. STEP 5's legibility card shows the plan's real limits in
// words, and says what stops when the plan expires.

import { ConvexError } from "convex/values";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  Archive,
  CalendarClock,
  Check,
  Copy,
  Download,
  ExternalLink,
  Images,
  LoaderCircle,
  LogOut,
  Pause,
  Play,
  Plus,
  QrCode,
  Sparkles,
  Users,
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
import { memoriesPanelSr as dict } from "@/lib/i18n/sr/memories-panel";
import {
  belgradeLocalToEpoch,
  epochToBelgradeLocal,
  formatBelgrade,
  formatBelgradeDate,
} from "@/lib/belgrade-time";
import { MemoriesHostGallery } from "./memories-host-gallery";

const DAY_MS = 24 * 60 * 60 * 1000;

type MemoriesPanelData = Extract<
  FunctionReturnType<typeof api.clientPanel.memoriesPanel>,
  { status: "available" }
>;
type SpaceData = NonNullable<MemoriesPanelData["space"]>;

const numberFormatter = new Intl.NumberFormat("sr-Latn-RS");

const PLAN_LABEL: Record<string, string> = {
  basic: "Basic",
  standard: "Standard",
  premium: "Premium",
};

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ConvexError && typeof error.data === "string") {
    return error.data;
  }
  return error instanceof Error ? error.message : fallback;
}

export function MemoriesPanelSection({
  data,
  onSignOut,
}: {
  data: MemoriesPanelData;
  onSignOut: () => void;
}) {
  const { space } = data;

  return (
    <div>
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

      {!space ? (
        <section className="mt-7 border border-border bg-card p-6 sm:p-10">
          <h2 className="text-2xl font-semibold tracking-[-0.04em]">
            {dict.noSpaceTitle}
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
            {dict.noSpaceBody}
          </p>
        </section>
      ) : (
        <div className="mt-7 grid gap-6">
          <StatusBanner space={space} entitled={data.entitled} />
          <SessionCard data={data} space={space} />
          {data.session ? (
            <MemoriesHostGallery
              sessionId={data.session.id}
              wallApprovalEnabled={
                space.wallEnabled && space.wallRequiresApproval
              }
            />
          ) : null}
          {space.mode === "one_off" ? (
            <WindowCard space={space} />
          ) : (
            <PastNights data={data} />
          )}
          <VisibilitySwitches space={space} />
          <PauseControl space={space} />
          <PlanCard data={data} />
          <RetentionCard data={data} />
          <ExportCard space={space} />
          <CardsManager space={space} />
        </div>
      )}
    </div>
  );
}

// --- status + expiry banner -------------------------------------------------

function StatusBanner({
  space,
  entitled,
}: {
  space: SpaceData;
  entitled: boolean;
}) {
  if (!entitled) {
    return (
      <Banner tone="warn" title={dict.expiredTitle} body={dict.expiredBody} />
    );
  }
  if (space.status === "paused") {
    return (
      <Banner
        tone="warn"
        title={dict.spaceStatusPausedTitle}
        body={dict.spaceStatusPausedBody}
      />
    );
  }
  if (space.status === "closed" || space.status === "archived") {
    return (
      <Banner
        tone="neutral"
        title={dict.spaceStatusClosedTitle}
        body={dict.spaceStatusClosedBody}
      />
    );
  }
  return (
    <Banner
      tone="ok"
      title={dict.spaceStatusActiveTitle}
      body={dict.spaceStatusActiveBody}
    />
  );
}

const BANNER_TONE: Record<string, string> = {
  ok: "border-primary/40 bg-primary/5",
  warn: "border-amber-500/50 bg-amber-500/10",
  neutral: "border-border bg-secondary/40",
};

function Banner({
  tone,
  title,
  body,
}: {
  tone: "ok" | "warn" | "neutral";
  title: string;
  body: string;
}) {
  return (
    <section className={`border p-5 ${BANNER_TONE[tone]}`}>
      <p className="font-semibold leading-6">{title}</p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{body}</p>
    </section>
  );
}

// --- current session --------------------------------------------------------

function SessionCard({
  data,
  space,
}: {
  data: MemoriesPanelData;
  space: SpaceData;
}) {
  const heading =
    space.mode === "one_off"
      ? dict.sessionHeadingOneOff
      : dict.sessionHeadingRecurring;
  const empty =
    space.mode === "one_off"
      ? dict.sessionNoneOneOff
      : dict.sessionNoneRecurring;

  return (
    <section className="border border-border bg-card p-5 sm:p-7">
      <h2 className="font-semibold">{heading}</h2>
      {data.session ? (
        <dl className="mt-5 grid gap-4 border border-border sm:grid-cols-2">
          <Stat
            icon={<Images className="size-4 text-primary" />}
            label={dict.photosLabel}
            value={data.session.photoCount}
          />
          <Stat
            icon={<Users className="size-4 text-primary" />}
            label={dict.guestsLabel}
            value={data.session.guestCount}
            className="sm:border-l border-border"
          />
        </dl>
      ) : (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}

function Stat({
  icon,
  label,
  value,
  className = "",
}: {
  icon: ReactNode;
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <div className={`p-5 ${className}`}>
      <dt className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="mt-2 text-4xl font-semibold tabular-nums text-primary">
        {numberFormatter.format(value)}
      </dd>
    </div>
  );
}

// --- one_off window controls ------------------------------------------------

function WindowCard({ space }: { space: SpaceData }) {
  const extend = useMutation(api.memoriesHost.extendSpaceWindow);
  const close = useMutation(api.memoriesHost.closeSpaceWindow);
  const [dialog, setDialog] = useState<"extend" | "close" | null>(null);
  const [newEnd, setNewEnd] = useState(
    space.windowEndAt ? epochToBelgradeLocal(space.windowEndAt) : "",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const closed = space.status === "closed" || space.status === "archived";

  async function runExtend() {
    setError(null);
    const epoch = belgradeLocalToEpoch(newEnd);
    if (epoch === null) {
      setError(dict.extendError);
      return;
    }
    setPending(true);
    try {
      await extend({ spaceId: space.id, windowEndAt: epoch });
      setDialog(null);
      toast.success(dict.extendSuccess);
    } catch (err) {
      setError(errorMessage(err, dict.extendError));
    } finally {
      setPending(false);
    }
  }

  async function runClose() {
    setPending(true);
    try {
      await close({ spaceId: space.id });
      setDialog(null);
      toast.success(dict.closeSuccess);
    } catch (err) {
      toast.error(errorMessage(err, dict.closeError));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="border border-border bg-card p-5 sm:p-7">
      <h2 className="flex items-center gap-2 font-semibold">
        <CalendarClock className="size-4 text-primary" />
        {dict.windowHeading}
      </h2>
      <dl className="mt-5 grid gap-3 border border-border sm:grid-cols-2">
        <div className="border-b border-border p-4 sm:border-b-0 sm:border-r">
          <dt className="text-xs text-muted-foreground">
            {dict.windowOpensLabel}
          </dt>
          <dd className="mt-1 font-medium tabular-nums">
            {formatBelgrade(space.windowStartAt)}
          </dd>
        </div>
        <div className="p-4">
          <dt className="text-xs text-muted-foreground">
            {dict.windowClosesLabel}
          </dt>
          <dd className="mt-1 font-medium tabular-nums">
            {formatBelgrade(space.windowEndAt)}
            {closed ? ` · ${dict.windowClosedNote}` : ""}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">{dict.timezoneNote}</p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <Button variant="outline" onClick={() => setDialog("extend")}>
          <CalendarClock className="size-4" />
          {dict.extendWindowAction}
        </Button>
        {!closed ? (
          <Button variant="outline" onClick={() => setDialog("close")}>
            {dict.closeWindowAction}
          </Button>
        ) : null}
      </div>

      <Dialog
        open={dialog === "extend"}
        onOpenChange={(o) => (pending ? null : setDialog(o ? "extend" : null))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dict.extendDialogTitle}</DialogTitle>
            <DialogDescription className="leading-6">
              {dict.extendDialogBody}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="mem-extend-end">{dict.extendNewEndLabel}</Label>
            <Input
              id="mem-extend-end"
              type="datetime-local"
              value={newEnd}
              onChange={(e) => setNewEnd(e.target.value)}
              className="h-11"
            />
            <p className="text-xs text-muted-foreground">{dict.timezoneNote}</p>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={pending}>
                {dict.closeCancel}
              </Button>
            </DialogClose>
            <Button onClick={() => void runExtend()} disabled={pending}>
              {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
              {dict.extendConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialog === "close"}
        onOpenChange={(o) => (pending ? null : setDialog(o ? "close" : null))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dict.closeDialogTitle}</DialogTitle>
            <DialogDescription className="leading-6">
              {dict.closeDialogBody}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={pending}>
                {dict.closeCancel}
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => void runClose()}
              disabled={pending}
            >
              {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
              {dict.closeConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

// --- past nights (recurring) ------------------------------------------------

function PastNights({ data }: { data: MemoriesPanelData }) {
  return (
    <section className="border border-border bg-card p-5 sm:p-7">
      <h2 className="font-semibold">{dict.pastNightsHeading}</h2>
      {data.pastNights.length ? (
        <ul className="mt-4 divide-y divide-border border-y border-border">
          {data.pastNights.map((night) => (
            <li
              key={night.id}
              className="flex items-center justify-between gap-3 py-3 text-sm"
            >
              <span className="font-medium tabular-nums">
                {formatBelgradeDate(night.openedAt)}
                {night.status === "open" ? (
                  <span className="ml-2 border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                    {dict.nightOpen}
                  </span>
                ) : null}
              </span>
              <span className="flex items-center gap-4 tabular-nums text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Images className="size-3.5" />
                  {numberFormatter.format(night.photoCount)}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="size-3.5" />
                  {numberFormatter.format(night.guestCount)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          {dict.pastNightsEmpty}
        </p>
      )}
    </section>
  );
}

// --- the two visibility switches --------------------------------------------

function VisibilitySwitches({ space }: { space: SpaceData }) {
  const setVisibility = useMutation(api.memoriesHost.setSpaceVisibility);
  const [pending, setPending] = useState<
    "gallery" | "wall" | "approval" | null
  >(null);

  async function toggle(
    which: "gallery" | "wall" | "approval",
    next: boolean,
  ) {
    setPending(which);
    try {
      await setVisibility({
        spaceId: space.id,
        ...(which === "gallery"
          ? { publicGalleryEnabled: next }
          : which === "wall"
            ? { wallEnabled: next }
            : { wallRequiresApproval: next }),
      });
    } catch (error) {
      toast.error(errorMessage(error, dict.visibilitySaveError));
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="border border-border bg-card p-5 sm:p-7">
      <h2 className="font-semibold">{dict.visibilityHeading}</h2>
      <div className="mt-5 grid gap-4">
        <SwitchRow
          label={dict.publicGalleryLabel}
          explain={dict.publicGalleryExplain}
          on={space.publicGalleryEnabled}
          busy={pending === "gallery"}
          onToggle={(next) => void toggle("gallery", next)}
          extra={
            space.publicGalleryEnabled ? (
              <Button asChild variant="ghost" size="sm" className="mt-2">
                <Link
                  href={`/m/${space.code}/galerija`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="size-4" />
                  {dict.publicGalleryLinkLabel}
                </Link>
              </Button>
            ) : null
          }
        />
        <SwitchRow
          label={dict.wallLabel}
          explain={dict.wallExplain}
          on={space.wallEnabled}
          busy={pending === "wall"}
          onToggle={(next) => void toggle("wall", next)}
          extra={
            space.wallEnabled ? (
              <div className="mt-2 grid gap-3">
                <Button asChild variant="ghost" size="sm" className="w-fit">
                  <Link
                    href={`/zid/${space.code}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="size-4" />
                    {dict.wallOpenLink}
                  </Link>
                </Button>
                <p className="text-xs text-muted-foreground">
                  {dict.wallOpenHint}
                </p>
                {/* STEP 4 — the "nervous host" gate, nested under the wall. */}
                <SwitchRow
                  label={dict.wallApprovalLabel}
                  explain={dict.wallApprovalExplain}
                  on={space.wallRequiresApproval}
                  busy={pending === "approval"}
                  onToggle={(next) => void toggle("approval", next)}
                />
              </div>
            ) : null
          }
        />
      </div>
      <p className="mt-4 border-l-2 border-border pl-3 text-xs leading-5 text-muted-foreground">
        {space.guestVisibilityChoice ? dict.guestChoiceOn : dict.guestChoiceOff}
      </p>
    </section>
  );
}

function SwitchRow({
  label,
  explain,
  on,
  busy,
  onToggle,
  note,
  extra,
}: {
  label: string;
  explain: string;
  on: boolean;
  busy: boolean;
  onToggle: (next: boolean) => void;
  note?: string;
  extra?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border border-border p-4">
      <div className="min-w-0">
        <p className="font-medium">{label}</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{explain}</p>
        {note ? (
          <p className="mt-1 text-xs text-muted-foreground">{note}</p>
        ) : null}
        {extra}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={busy}
        onClick={() => onToggle(!on)}
        className={`relative mt-1 inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${
          on ? "border-primary bg-primary" : "border-border bg-secondary"
        }`}
      >
        <span
          className={`inline-block size-5 transform rounded-full bg-background shadow transition-transform ${
            on ? "translate-x-6" : "translate-x-0.5"
          }`}
        />
        {busy ? (
          <LoaderCircle className="absolute inset-0 m-auto size-3.5 animate-spin text-primary-foreground" />
        ) : null}
      </button>
    </div>
  );
}

// --- pause / resume ---------------------------------------------------------

function PauseControl({ space }: { space: SpaceData }) {
  const setPaused = useMutation(api.memoriesHost.setSpacePaused);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  // Only meaningful between active and paused.
  if (space.status !== "active" && space.status !== "paused") return null;
  const paused = space.status === "paused";

  async function resume() {
    setPending(true);
    try {
      await setPaused({ spaceId: space.id, paused: false });
      toast.success(dict.resumeSuccess);
    } catch (error) {
      toast.error(errorMessage(error, dict.pauseError));
    } finally {
      setPending(false);
    }
  }

  async function pause() {
    setPending(true);
    try {
      await setPaused({ spaceId: space.id, paused: true });
      setOpen(false);
      toast.success(dict.pauseSuccess);
    } catch (error) {
      toast.error(errorMessage(error, dict.pauseError));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="border border-border bg-card p-5 sm:p-7">
      {paused ? (
        <Button onClick={() => void resume()} disabled={pending}>
          {pending ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Play className="size-4" />
          )}
          {dict.resumeAction}
        </Button>
      ) : (
        <Dialog open={open} onOpenChange={setOpen}>
          <Button variant="outline" onClick={() => setOpen(true)}>
            <Pause className="size-4" />
            {dict.pauseAction}
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{dict.pauseDialogTitle}</DialogTitle>
              <DialogDescription className="leading-6">
                {dict.pauseDialogBody}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" disabled={pending}>
                  {dict.pauseCancel}
                </Button>
              </DialogClose>
              <Button onClick={() => void pause()} disabled={pending}>
                {pending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : null}
                {dict.pauseConfirm}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}

// --- plan legibility (STEP 5) -----------------------------------------------

function PlanCard({ data }: { data: MemoriesPanelData }) {
  return (
    <section className="border border-border bg-card p-5 sm:p-7">
      <h2 className="flex items-center gap-2 font-semibold">
        <Sparkles className="size-4 text-primary" />
        {dict.planHeading}
      </h2>
      {data.plan ? (
        <>
          <p className="mt-3 text-sm font-medium">
            {fmt(dict.planTierLabel, {
              plan: PLAN_LABEL[data.plan.planKey] ?? data.plan.planKey,
            })}
          </p>
          <ul className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
            <li className="flex items-center gap-2 border border-border p-3">
              <Check className="size-4 text-primary" />
              {fmt(dict.planPhotosPerGuest, { count: data.plan.photosPerGuest })}
            </li>
            <li className="flex items-center gap-2 border border-border p-3">
              <Check className="size-4 text-primary" />
              {fmt(dict.planRetention, { days: data.plan.retentionDays })}
            </li>
            <li className="flex items-center gap-2 border border-border p-3">
              <Check className="size-4 text-primary" />
              {fmt(dict.planResolution, { px: data.plan.maxImageDimension })}
            </li>
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            {dict.planActiveNote}
          </p>
        </>
      ) : (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {dict.expiredBody}
        </p>
      )}
    </section>
  );
}

// --- retention window (TASK-20 STEP 4) --------------------------------------

function RetentionCard({ data }: { data: MemoriesPanelData }) {
  const days = data.plan?.retentionDays ?? null;
  // The oldest live photo's deletion date = its createdAt + the plan window.
  const oldestGoesAt =
    days !== null && data.oldestPhotoAt !== null
      ? data.oldestPhotoAt + days * DAY_MS
      : null;

  return (
    <section className="border border-border bg-card p-5 sm:p-7">
      <h2 className="flex items-center gap-2 font-semibold">
        <CalendarClock className="size-4 text-primary" />
        {dict.retentionHeading}
      </h2>
      {days !== null ? (
        <>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {fmt(dict.retentionWindow, { days })}
          </p>
          <p className="mt-2 text-sm font-medium">
            {oldestGoesAt !== null
              ? fmt(dict.retentionOldest, {
                  date: formatBelgradeDate(oldestGoesAt),
                })
              : dict.retentionNoPhotos}
          </p>
        </>
      ) : (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {dict.expiredBody}
        </p>
      )}
    </section>
  );
}

// --- ZIP export (TASK-21) ---------------------------------------------------

const EXPORT_ERROR_REASON: Record<string, string> = {
  no_photos: dict.exportErrorNoPhotos,
  build_failed: dict.exportErrorBuildFailed,
  storage_failed: dict.exportErrorStorageFailed,
};

function humanSize(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${numberFormatter.format(Math.round(value * 10) / 10)} ${units[unit]}`;
}

type ExportData = NonNullable<
  FunctionReturnType<typeof api.memoriesExport.exportsForSpace>
>;
type ExportSummary = Extract<ExportData, { status: "ok" }>["history"][number];

function ExportCard({ space }: { space: SpaceData }) {
  const data = useQuery(api.memoriesExport.exportsForSpace, {
    spaceId: space.id,
  });
  const start = useMutation(api.memoriesExport.startExport);
  const retry = useMutation(api.memoriesExport.retryExport);
  const [pending, setPending] = useState(false);
  // Sampled once at mount (not per render) to judge link expiry client-side.
  const [now] = useState(() => Date.now());

  const view = data && data.status === "ok" ? data : null;
  const active = view?.active ?? null;
  const isBuilding =
    active?.status === "queued" || active?.status === "building";

  async function onStart() {
    setPending(true);
    try {
      await start({ spaceId: space.id });
    } catch (error) {
      toast.error(errorMessage(error, dict.exportStartError));
    } finally {
      setPending(false);
    }
  }

  async function onRetry(jobId: ExportSummary["id"]) {
    setPending(true);
    try {
      await retry({ jobId });
    } catch (error) {
      toast.error(errorMessage(error, dict.exportStartError));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="border border-border bg-card p-5 sm:p-7">
      <h2 className="flex items-center gap-2 font-semibold">
        <Archive className="size-4 text-primary" />
        {dict.exportHeading}
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
        {dict.exportBody}
      </p>

      <div className="mt-5">
        {isBuilding ? (
          <div className="flex items-center gap-2 text-sm font-medium">
            <LoaderCircle className="size-4 animate-spin text-primary" />
            {active?.status === "building"
              ? fmt(dict.exportBuilding, { count: active.encodedCount })
              : dict.exportQueued}
          </div>
        ) : view && !view.hasReadyPhotos ? (
          <p className="text-sm text-muted-foreground">{dict.exportEmpty}</p>
        ) : (
          <Button onClick={onStart} disabled={pending || !view}>
            <Download className="size-4" /> {dict.exportButton}
          </Button>
        )}
      </div>

      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        {dict.exportLifetimeNote}
      </p>

      {view && view.history.length > 0 ? (
        <div className="mt-6 border-t border-border pt-5">
          <h3 className="text-sm font-semibold">{dict.exportPastHeading}</h3>
          <ul className="mt-3 grid gap-3">
            {view.history.map((job) => (
              <ExportRow
                key={job.id}
                job={job}
                onRetry={onRetry}
                pending={pending}
                now={now}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function ExportRow({
  job,
  onRetry,
  pending,
  now,
}: {
  job: ExportSummary;
  onRetry: (jobId: ExportSummary["id"]) => void;
  pending: boolean;
  now: number;
}) {
  const expired =
    job.status === "expired" ||
    (job.expiresAt !== null && now >= job.expiresAt);
  const created = formatBelgrade(job.createdAt);

  if (job.status === "ready" && !expired && job.downloadUrl) {
    return (
      <li className="flex flex-wrap items-center justify-between gap-3 border border-border bg-secondary/30 p-3 text-sm">
        <div>
          <p className="font-medium">
            {fmt(dict.exportPhotoCount, { count: job.photoCount ?? 0 })}
            {job.archiveBytes !== null
              ? ` · ${humanSize(job.archiveBytes)}`
              : ""}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {job.expiresAt !== null
              ? fmt(dict.exportExpiresAt, {
                  date: formatBelgradeDate(job.expiresAt),
                })
              : created}
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <a href={job.downloadUrl} download>
            <Download className="size-4" /> {dict.exportDownload}
          </a>
        </Button>
      </li>
    );
  }

  if (job.status === "failed") {
    const reason = job.error
      ? (EXPORT_ERROR_REASON[job.error] ?? dict.exportErrorBuildFailed)
      : dict.exportErrorBuildFailed;
    return (
      <li className="flex flex-wrap items-center justify-between gap-3 border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
        <p className="font-medium">{fmt(dict.exportFailedPrefix, { reason })}</p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onRetry(job.id)}
          disabled={pending}
        >
          {dict.exportRetry}
        </Button>
      </li>
    );
  }

  // expired (or a ready row past its lifetime with the blob already purged)
  return (
    <li className="border border-border bg-secondary/20 p-3 text-sm text-muted-foreground">
      <p>{created}</p>
      <p className="mt-0.5 text-xs">{dict.exportExpired}</p>
    </li>
  );
}

// --- table cards (STEP 3) ---------------------------------------------------

function CardsManager({ space }: { space: SpaceData }) {
  const cards = useQuery(api.cards.listSpaceCards, { spaceId: space.id });
  const mint = useMutation(api.cards.mintCardsForSpace);
  const disable = useMutation(api.cards.disableCard);

  const [count, setCount] = useState("8");
  const [start, setStart] = useState("1");
  const [prefix, setPrefix] = useState<string>(dict.mintPrefixPlaceholder);
  const [pending, setPending] = useState(false);
  const [disableTarget, setDisableTarget] = useState<Id<"cards"> | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const rows = cards ?? [];
  const mostActive = rows.find((c) => c.status === "active" && c.totalScans > 0);

  async function runMint() {
    const n = Number(count);
    const s = Number(start);
    setPending(true);
    try {
      const result = await mint({
        spaceId: space.id,
        count: n,
        startIndex: Number.isFinite(s) ? s : 1,
        ...(prefix.trim() ? { labelPrefix: prefix.trim() } : {}),
      });
      toast.success(fmt(dict.mintSuccess, { count: result.created.length }));
    } catch (error) {
      toast.error(errorMessage(error, dict.mintError));
    } finally {
      setPending(false);
    }
  }

  async function runDisable(cardId: Id<"cards">) {
    setPending(true);
    try {
      await disable({ cardId });
      setDisableTarget(null);
      toast.success(dict.disableCardSuccess);
    } catch (error) {
      toast.error(errorMessage(error, dict.disableCardError));
    } finally {
      setPending(false);
    }
  }

  function copyLink(cardCode: string) {
    const url = `${window.location.origin}/r/${cardCode}`;
    void navigator.clipboard?.writeText(url);
    setCopied(cardCode);
    setTimeout(() => setCopied((c) => (c === cardCode ? null : c)), 1500);
  }

  return (
    <section className="border border-border bg-card p-5 sm:p-7">
      <h2 className="flex items-center gap-2 font-semibold">
        <QrCode className="size-4 text-primary" />
        {dict.cardsHeading}
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {dict.cardsBody}
      </p>

      {/* Mint */}
      <div className="mt-5 grid gap-4 border border-border p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <div className="grid gap-2">
          <Label htmlFor="mint-prefix">{dict.mintPrefixLabel}</Label>
          <Input
            id="mint-prefix"
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            className="h-11"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="mint-count">{dict.mintCountLabel}</Label>
          <Input
            id="mint-count"
            type="number"
            min={1}
            max={50}
            value={count}
            onChange={(e) => setCount(e.target.value)}
            className="h-11"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="mint-start">{dict.mintStartLabel}</Label>
          <Input
            id="mint-start"
            type="number"
            min={1}
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="h-11"
          />
        </div>
        <Button onClick={() => void runMint()} disabled={pending}>
          {pending ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          {dict.mintAction}
        </Button>
      </div>

      {/* List */}
      <div className="mt-5">
        <h3 className="text-sm font-semibold">
          {fmt(dict.cardsCount, { count: rows.length })}
        </h3>
        {rows.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-[0.08em] text-muted-foreground">
                  <th className="py-2 pr-4 font-semibold">
                    {dict.cardLabelColumn}
                  </th>
                  <th className="py-2 pr-4 font-semibold">
                    {dict.cardCodeColumn}
                  </th>
                  <th className="py-2 pr-4 font-semibold">
                    {dict.cardScansColumn}
                  </th>
                  <th className="py-2 pr-4 font-semibold">
                    {dict.cardGuestsColumn}
                  </th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((card) => (
                  <tr
                    key={card.cardId}
                    className="border-b border-border last:border-b-0"
                  >
                    <td className="py-3 pr-4">
                      <span className="font-medium">{card.label}</span>
                      {mostActive?.cardId === card.cardId ? (
                        <span className="ml-2 border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                          {dict.cardMostActive}
                        </span>
                      ) : null}
                      {card.status === "disabled" ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {dict.cardStatusDisabled}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-3 pr-4">
                      <button
                        type="button"
                        onClick={() => copyLink(card.cardCode)}
                        className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                        // Include the code: a bare "Kopiraj" makes every row
                        // read identically and drops the visible label from
                        // the accessible name (Label in Name).
                        aria-label={`${dict.copyAria} ${card.cardCode}`}
                      >
                        {card.cardCode}
                        {copied === card.cardCode ? (
                          <Check className="size-3.5" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                      </button>
                    </td>
                    <td className="py-3 pr-4 tabular-nums">
                      {numberFormatter.format(card.totalScans)}
                    </td>
                    <td className="py-3 pr-4 tabular-nums">
                      {numberFormatter.format(card.guestCount)}
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button asChild variant="ghost" size="sm">
                          <Link
                            href={`/r/${card.cardCode}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`${dict.openCardLink} — ${card.cardCode}`}
                          >
                            <ExternalLink className="size-4" />
                          </Link>
                        </Button>
                        {card.status === "active" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDisableTarget(card.cardId)}
                          >
                            {dict.disableCardAction}
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">{dict.cardsEmpty}</p>
        )}
      </div>

      <Dialog
        open={disableTarget !== null}
        onOpenChange={(o) => (o ? null : setDisableTarget(null))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dict.disableCardDialogTitle}</DialogTitle>
            <DialogDescription className="leading-6">
              {dict.disableCardDialogBody}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={pending}>
                {dict.disableCardCancel}
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() =>
                disableTarget ? void runDisable(disableTarget) : undefined
              }
              disabled={pending}
            >
              {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
              {dict.disableCardConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Guest page link */}
      <div className="mt-6 border-t border-border pt-5">
        <Button asChild variant="outline">
          <Link
            href={`/m/${space.code}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="size-4" />
            {dict.guestPageLink}
          </Link>
        </Button>
      </div>
    </section>
  );
}
