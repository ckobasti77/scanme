"use client";

// TASK-20 STEP 0 — the host night gallery grid, inside the Memories panel. The
// host reviews a night's committed photos (both visibilities — the host may see
// host_only ones), read via the cursor-paginated hostSessionGallery, so a night
// with hundreds of photos is fully reachable with "load more", never capped.
// Each photo can be removed by the host; delete funnels into the shared
// tombstone → purge machinery (convex/memories.hostDeletePhoto).
//
// TASK-23 — the same grid is where the host PULLS THE NIGHT OUT: a selection
// mode turns each everyone-visible, committed photo into a pick that lands on
// the venue's public page (convex/memoriesArchive.pinPhotosToEvent). host_only
// photos are visibly NOT selectable, with the reason stated, because a guest who
// tapped "samo ja i vlasnik" never consented to the front page. The archive
// strip below shows what is currently on the page; its first tile is the cover
// ("naslovna"), and reordering (set-as-cover) decides it.

import { useMemo, useState } from "react";
import { ConvexError } from "convex/values";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import {
  CheckCircle2,
  ExternalLink,
  EyeOff,
  Images,
  ImagePlus,
  LoaderCircle,
  Lock,
  MonitorPlay,
  Star,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
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
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { fmt } from "@/lib/i18n";
import { memoriesPanelSr as dict } from "@/lib/i18n/sr/memories-panel";

const PAGE_SIZE = 24;

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ConvexError && typeof error.data === "string") {
    return error.data;
  }
  return error instanceof Error ? error.message : fallback;
}

export function MemoriesHostGallery({
  sessionId,
  wallApprovalEnabled = false,
}: {
  sessionId: Id<"memoriesSessions">;
  // TASK-22 STEP 4 — true when the space runs approve-before-wall on an enabled
  // wall. Only then does the per-photo wall toggle appear; without it the wall
  // shows every everyone-visible photo and there is nothing to approve.
  wallApprovalEnabled?: boolean;
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.memories.hostSessionGallery,
    { sessionId },
    { initialNumItems: PAGE_SIZE },
  );
  const deletePhoto = useMutation(api.memories.hostDeletePhoto);
  const setWallApproval = useMutation(api.memoriesWall.setPhotoWallApproval);
  const [target, setTarget] = useState<Id<"memoriesPhotos"> | null>(null);
  const [pending, setPending] = useState(false);
  const [approving, setApproving] = useState<Id<"memoriesPhotos"> | null>(null);

  // --- TASK-23 archive picker state ---------------------------------------
  const targets = useQuery(api.memoriesArchive.archiveTargets, { sessionId });
  const pinPhotos = useMutation(api.memoriesArchive.pinPhotosToEvent);
  const unpinPhoto = useMutation(api.memoriesArchive.unpinPhotoFromEvent);
  const reorderItems = useMutation(api.memoriesArchive.reorderArchiveItems);

  const [chosenEventId, setChosenEventId] = useState<Id<"events"> | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<Id<"memoriesPhotos">>>(
    () => new Set(),
  );
  const [pinning, setPinning] = useState(false);
  const [busyPin, setBusyPin] = useState<Id<"memoriesPhotos"> | null>(null);
  const [busyCover, setBusyCover] = useState<Id<"eventArchiveItems"> | null>(
    null,
  );

  // The active target event: the host's explicit choice, else the resolved
  // default (one_off's event, or the recurring event whose window holds tonight).
  const activeEventId = chosenEventId ?? targets?.defaultEventId ?? null;
  const archive = useQuery(
    api.memoriesArchive.eventArchive,
    activeEventId ? { eventId: activeEventId } : "skip",
  );

  // photoId → its archive row, for the "already pinned" badge, the unpin action,
  // and cross-referencing the picker against what is already on the page.
  const pinnedByPhoto = useMemo(() => {
    const map = new Map<
      Id<"memoriesPhotos">,
      { itemId: Id<"eventArchiveItems">; order: number }
    >();
    for (const item of archive?.items ?? []) {
      if (item.sourcePhotoId) {
        map.set(item.sourcePhotoId, {
          itemId: item.itemId,
          order: item.order,
        });
      }
    }
    return map;
  }, [archive]);

  const hasEvents = (targets?.events.length ?? 0) > 0;
  const atCap =
    archive !== undefined && archive.count + selected.size >= archive.cap;

  function toggleSelect(photoId: Id<"memoriesPhotos">) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  }

  function exitSelecting() {
    setSelecting(false);
    setSelected(new Set());
  }

  async function runPin() {
    if (!activeEventId || selected.size === 0) return;
    setPinning(true);
    try {
      await pinPhotos({
        eventId: activeEventId,
        photoIds: [...selected],
      });
      toast.success(
        fmt(dict.archivePinSuccess, { event: archive?.eventTitle ?? "" }),
      );
      exitSelecting();
    } catch (error) {
      toast.error(errorMessage(error, dict.archivePinError));
    } finally {
      setPinning(false);
    }
  }

  async function runUnpin(photoId: Id<"memoriesPhotos">) {
    if (!activeEventId) return;
    setBusyPin(photoId);
    try {
      await unpinPhoto({ eventId: activeEventId, photoId });
    } catch (error) {
      toast.error(errorMessage(error, dict.archiveUnpinError));
    } finally {
      setBusyPin(null);
    }
  }

  // Set-as-cover = reorder the chosen row to the front (order 0). The full
  // ordered list is required by the mutation, so we move the target to the head
  // and keep the rest in place.
  async function makeCover(itemId: Id<"eventArchiveItems">) {
    if (!activeEventId || !archive) return;
    setBusyCover(itemId);
    try {
      const rest = archive.items
        .map((i) => i.itemId)
        .filter((id) => id !== itemId);
      await reorderItems({ eventId: activeEventId, itemIds: [itemId, ...rest] });
    } catch (error) {
      toast.error(errorMessage(error, dict.archiveReorderError));
    } finally {
      setBusyCover(null);
    }
  }

  async function runDelete(photoId: Id<"memoriesPhotos">) {
    setPending(true);
    try {
      await deletePhoto({ photoId });
      setTarget(null);
      toast.success(dict.photoDeleteSuccess);
    } catch (error) {
      toast.error(errorMessage(error, dict.photoDeleteError));
    } finally {
      setPending(false);
    }
  }

  async function toggleWall(photoId: Id<"memoriesPhotos">, approved: boolean) {
    setApproving(photoId);
    try {
      await setWallApproval({ photoId, approved });
    } catch (error) {
      toast.error(errorMessage(error, dict.wallApproveError));
    } finally {
      setApproving(null);
    }
  }

  const venueEventHref =
    archive && archive.businessSlug
      ? `/${archive.businessSlug}/venue/${archive.eventSlug}`
      : null;

  return (
    <section className="border border-border bg-card p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <Images className="size-4 text-primary" />
          {dict.galleryHeading}
        </h2>
        {/* TASK-23 — enter/leave selection mode. Only meaningful once the night
            has photos and the business has at least one event to pin to. */}
        {results.length > 0 && hasEvents ? (
          selecting ? (
            <Button variant="ghost" size="sm" onClick={exitSelecting}>
              <X className="size-4" />
              {dict.archiveSelectCancel}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelecting(true)}
            >
              <ImagePlus className="size-4" />
              {dict.archiveSelectAction}
            </Button>
          )
        ) : null}
      </div>

      {/* No event to pin to yet — say why the archive action is unavailable. */}
      {results.length > 0 && targets !== undefined && !hasEvents ? (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          {dict.archiveNoEvents}
        </p>
      ) : null}

      {/* Selection toolbar: which event, the running count, the pin action. */}
      {selecting ? (
        <ArchiveToolbar
          targets={targets}
          activeEventId={activeEventId}
          onChooseEvent={setChosenEventId}
          selectedCount={selected.size}
          capNote={
            archive
              ? fmt(dict.archiveCapNote, {
                  count: archive.count,
                  max: archive.cap,
                })
              : null
          }
          pinning={pinning}
          canPin={selected.size > 0 && activeEventId !== null}
          onPin={() => void runPin()}
        />
      ) : null}

      {status === "LoadingFirstPage" ? (
        <div className="mt-5 flex justify-center py-8">
          <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : results.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{dict.galleryEmpty}</p>
      ) : (
        <>
          <ul className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {results.map((photo, index) => {
              const isHostOnly = photo.visibility === "host_only";
              const pinned = pinnedByPhoto.get(photo.photoId);
              const isPinned = pinned !== undefined;
              const isSelected = selected.has(photo.photoId);
              // In selection mode, a photo is a candidate only if it can legally
              // reach the public page: everyone-visible and not already pinned.
              const selectable = selecting && !isHostOnly && !isPinned;
              return (
                <li key={photo.photoId} className="group relative aspect-square">
                  {/* Signed Convex thumb URL; a plain img keeps the panel light. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.image.thumbUrl}
                    alt={fmt(dict.galleryPhotoAlt, { index: index + 1 })}
                    loading="lazy"
                    className={`size-full object-cover ${
                      selecting && isHostOnly ? "opacity-40" : ""
                    }`}
                  />

                  {isHostOnly ? (
                    <span
                      className="absolute left-1 top-1 inline-flex items-center gap-1 bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                      title={dict.galleryHostOnlyBadge}
                    >
                      <EyeOff className="size-3" />
                      <span className="sr-only">
                        {dict.galleryHostOnlyBadge}
                      </span>
                    </span>
                  ) : null}

                  {/* Already on the venue page — a badge, and an unpin control. */}
                  {isPinned ? (
                    <span className="absolute left-1 bottom-1 inline-flex items-center gap-1 bg-primary/90 px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                      <Star className="size-3" />
                      {dict.archivePinnedBadge}
                    </span>
                  ) : null}

                  {/* Selection mode: a full-tile toggle for selectable photos, a
                      stated reason for host_only ones, an unpin for pinned ones. */}
                  {selecting ? (
                    selectable ? (
                      <button
                        type="button"
                        onClick={() => toggleSelect(photo.photoId)}
                        disabled={!isSelected && atCap}
                        aria-pressed={isSelected}
                        // The tile is otherwise nameless — a SR hears only
                        // "toggle button" with no way to tell WHICH photo is
                        // being put on the public page (TASK-25 a11y).
                        aria-label={fmt(dict.galleryPhotoAlt, {
                          index: index + 1,
                        })}
                        className={`absolute inset-0 flex items-center justify-center transition-colors disabled:cursor-not-allowed ${
                          isSelected
                            ? "bg-primary/30 ring-2 ring-inset ring-primary"
                            : "bg-black/0 hover:bg-black/20"
                        }`}
                      >
                        {isSelected ? (
                          // On a solid primary disc so the check survives any
                          // photo underneath (30% tint alone can drop under
                          // 3:1 on a dark photo).
                          <CheckCircle2 className="size-7 rounded-full bg-primary text-primary-foreground" />
                        ) : null}
                      </button>
                    ) : isHostOnly ? (
                      <span className="absolute inset-x-1 bottom-1 inline-flex items-center justify-center gap-1 bg-black/70 px-1 py-1 text-center text-[10px] font-medium leading-tight text-white">
                        <Lock className="size-3 shrink-0" />
                        {dict.archivePrivateReason}
                      </span>
                    ) : isPinned ? (
                      <button
                        type="button"
                        onClick={() => void runUnpin(photo.photoId)}
                        disabled={busyPin === photo.photoId}
                        className="absolute inset-x-1 top-1 inline-flex items-center justify-center gap-1 bg-black/70 px-1.5 py-1 text-[10px] font-semibold text-white"
                        title={dict.archiveUnpinAction}
                      >
                        {busyPin === photo.photoId ? (
                          <LoaderCircle className="size-3 animate-spin" />
                        ) : (
                          <X className="size-3" />
                        )}
                        {dict.archiveUnpinAction}
                      </button>
                    ) : null
                  ) : null}

                  {/* STEP 4 — the wall approval control, only when the space runs
                      approve-before-wall and only for photos that could reach the
                      wall (everyone-visible). Hidden while selecting to keep the
                      tile's job unambiguous. host_only photos never can. */}
                  {!selecting &&
                  wallApprovalEnabled &&
                  photo.visibility === "everyone" ? (
                    photo.wallApproved ? (
                      <button
                        type="button"
                        onClick={() => void toggleWall(photo.photoId, false)}
                        disabled={approving === photo.photoId}
                        className="absolute inset-x-1 bottom-1 inline-flex items-center justify-center gap-1 bg-primary/90 px-1.5 py-1 text-[10px] font-semibold text-primary-foreground"
                        title={dict.wallUnapproveAction}
                      >
                        {approving === photo.photoId ? (
                          <LoaderCircle className="size-3 animate-spin" />
                        ) : (
                          <MonitorPlay className="size-3" />
                        )}
                        {dict.wallOnBadge}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void toggleWall(photo.photoId, true)}
                        disabled={approving === photo.photoId}
                        className="absolute inset-x-1 bottom-1 inline-flex items-center justify-center gap-1 bg-black/70 px-1.5 py-1 text-[10px] font-semibold text-white"
                        title={dict.wallPendingBadge}
                      >
                        {approving === photo.photoId ? (
                          <LoaderCircle className="size-3 animate-spin" />
                        ) : (
                          <MonitorPlay className="size-3" />
                        )}
                        {dict.wallApproveAction}
                      </button>
                    )
                  ) : null}

                  {!selecting ? (
                    // Hover-reveal only where hover exists: on touch the
                    // control was an invisible-but-tappable corner — visible
                    // by default there, hidden-until-hover on pointers.
                    <button
                      type="button"
                      onClick={() => setTarget(photo.photoId)}
                      aria-label={dict.photoDeleteAction}
                      className="absolute right-1 top-1 inline-flex size-7 items-center justify-center bg-black/60 text-white transition-opacity focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {status === "CanLoadMore" || status === "LoadingMore" ? (
            <div className="mt-4 flex justify-center">
              <Button
                variant="outline"
                onClick={() => loadMore(PAGE_SIZE)}
                disabled={status === "LoadingMore"}
              >
                {status === "LoadingMore" ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : null}
                {dict.galleryLoadMore}
              </Button>
            </div>
          ) : null}
        </>
      )}

      {/* TASK-23 STEP 3 — what is currently on the venue page for this event,
          in order. The first tile is the cover ("naslovna"); set-as-cover on any
          other reorders it to the front. During selection an empty event says so
          rather than showing nothing. */}
      {activeEventId && archive && archive.items.length > 0 ? (
        <ArchiveStrip
          items={archive.items}
          venueEventHref={venueEventHref}
          busyCover={busyCover}
          onMakeCover={(id) => void makeCover(id)}
        />
      ) : selecting && activeEventId && archive ? (
        <div className="mt-6 border-t border-border pt-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Star className="size-4 text-primary" />
            {dict.archiveStripHeading}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {dict.archiveStripEmpty}
          </p>
        </div>
      ) : null}

      <Dialog
        open={target !== null}
        onOpenChange={(o) => (o || pending ? null : setTarget(null))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dict.photoDeleteDialogTitle}</DialogTitle>
            <DialogDescription className="leading-6">
              {dict.photoDeleteDialogBody}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={pending}>
                {dict.photoDeleteCancel}
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => (target ? void runDelete(target) : undefined)}
              disabled={pending}
            >
              {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
              {dict.photoDeleteConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

// The selection toolbar: choose the target event (a select for a recurring
// business with several; a static label otherwise), the running count against
// the cap, and the pin action. A one-line hint says what selecting does.
function ArchiveToolbar({
  targets,
  activeEventId,
  onChooseEvent,
  selectedCount,
  capNote,
  pinning,
  canPin,
  onPin,
}: {
  targets:
    | {
        businessSlug: string;
        mode: "recurring" | "one_off";
        defaultEventId: Id<"events"> | null;
        events: Array<{
          id: Id<"events">;
          title: string;
          slug: string;
          status: string;
          startsAt: number | null;
          endsAt: number | null;
        }>;
        truncated: boolean;
      }
    | null
    | undefined;
  activeEventId: Id<"events"> | null;
  onChooseEvent: (id: Id<"events">) => void;
  selectedCount: number;
  capNote: string | null;
  pinning: boolean;
  canPin: boolean;
  onPin: () => void;
}) {
  const events = targets?.events ?? [];
  const activeEvent = events.find((e) => e.id === activeEventId) ?? null;

  return (
    <div className="mt-4 border border-border bg-secondary/30 p-4">
      <p className="text-sm leading-6 text-muted-foreground">
        {dict.archiveHint}
      </p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <label
            htmlFor="archive-event"
            className="text-xs font-medium text-muted-foreground"
          >
            {dict.archiveEventLabel}
          </label>
          {events.length > 1 ? (
            <select
              id="archive-event"
              value={activeEventId ?? ""}
              onChange={(e) =>
                onChooseEvent(e.target.value as Id<"events">)
              }
              className="mt-1 block h-10 w-full min-w-0 max-w-xs border border-border bg-background px-2 text-sm"
            >
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.title}
                </option>
              ))}
            </select>
          ) : (
            <p className="mt-1 font-medium">
              {activeEvent?.title ?? "—"}
            </p>
          )}
          {targets?.truncated ? (
            // The picker window is capped server-side (ARCHIVE_TARGETS_CAP);
            // when the business has more events, say so instead of silently
            // hiding the tail. events.length === the cap exactly then.
            <p className="mt-1 text-xs text-muted-foreground">
              {fmt(dict.archiveEventsTruncated, { max: events.length })}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm tabular-nums text-muted-foreground">
            {fmt(dict.archiveSelectedCount, { count: selectedCount })}
            {capNote ? ` · ${capNote}` : ""}
          </span>
          <Button onClick={onPin} disabled={!canPin || pinning}>
            {pinning ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <ImagePlus className="size-4" />
            )}
            {dict.archivePinAction}
          </Button>
        </div>
      </div>
    </div>
  );
}

// The ordered archive strip for the active event — the venue page's actual
// picks. order 0 is the cover; every other tile offers "set as cover", which
// reorders it to the front.
function ArchiveStrip({
  items,
  venueEventHref,
  busyCover,
  onMakeCover,
}: {
  items: Array<{
    itemId: Id<"eventArchiveItems">;
    order: number;
    thumbUrl: string | null;
  }>;
  venueEventHref: string | null;
  busyCover: Id<"eventArchiveItems"> | null;
  onMakeCover: (id: Id<"eventArchiveItems">) => void;
}) {
  const ordered = [...items].sort((a, b) => a.order - b.order);
  return (
    <div className="mt-6 border-t border-border pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Star className="size-4 text-primary" />
          {dict.archiveStripHeading}
        </h3>
        {venueEventHref ? (
          <Button asChild variant="ghost" size="sm">
            <Link href={venueEventHref} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-4" />
              {dict.archiveOpenPageLink}
            </Link>
          </Button>
        ) : null}
      </div>
      <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {ordered.map((item, index) => (
          <li key={item.itemId} className="group relative aspect-square">
            {item.thumbUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.thumbUrl}
                alt=""
                loading="lazy"
                className="size-full object-cover"
              />
            ) : (
              <div className="size-full bg-secondary" />
            )}
            {index === 0 ? (
              <span className="absolute inset-x-1 top-1 inline-flex items-center justify-center gap-1 bg-primary/90 px-1 py-0.5 text-[10px] font-semibold text-primary-foreground">
                <Star className="size-3" />
                {dict.archiveCoverBadge}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onMakeCover(item.itemId)}
                disabled={busyCover === item.itemId}
                className="absolute inset-x-1 bottom-1 inline-flex items-center justify-center gap-1 bg-black/70 px-1 py-1 text-[10px] font-medium text-white transition-opacity focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
                title={dict.archiveSetCoverAction}
              >
                {busyCover === item.itemId ? (
                  <LoaderCircle className="size-3 animate-spin" />
                ) : (
                  <Star className="size-3" />
                )}
                {dict.archiveSetCoverAction}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
