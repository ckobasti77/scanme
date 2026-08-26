"use client";

// TASK-20 STEP 0 — the host night gallery grid, inside the Memories panel. The
// host reviews a night's committed photos (both visibilities — the host may see
// host_only ones), read via the cursor-paginated hostSessionGallery, so a night
// with hundreds of photos is fully reachable with "load more", never capped.
// Each photo can be removed by the host; delete funnels into the shared
// tombstone → purge machinery (convex/memories.hostDeletePhoto).

import { useState } from "react";
import { ConvexError } from "convex/values";
import { useMutation, usePaginatedQuery } from "convex/react";
import { EyeOff, Images, LoaderCircle, Trash2 } from "lucide-react";
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
}: {
  sessionId: Id<"memoriesSessions">;
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.memories.hostSessionGallery,
    { sessionId },
    { initialNumItems: PAGE_SIZE },
  );
  const deletePhoto = useMutation(api.memories.hostDeletePhoto);
  const [target, setTarget] = useState<Id<"memoriesPhotos"> | null>(null);
  const [pending, setPending] = useState(false);

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

  return (
    <section className="border border-border bg-card p-5 sm:p-7">
      <h2 className="flex items-center gap-2 font-semibold">
        <Images className="size-4 text-primary" />
        {dict.galleryHeading}
      </h2>

      {status === "LoadingFirstPage" ? (
        <div className="mt-5 flex justify-center py-8">
          <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : results.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{dict.galleryEmpty}</p>
      ) : (
        <>
          <ul className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {results.map((photo, index) => (
              <li key={photo.photoId} className="group relative aspect-square">
                {/* Signed Convex thumb URL; a plain img keeps the panel light. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.image.thumbUrl}
                  alt={fmt(dict.galleryPhotoAlt, { index: index + 1 })}
                  loading="lazy"
                  className="size-full object-cover"
                />
                {photo.visibility === "host_only" ? (
                  <span
                    className="absolute left-1 top-1 inline-flex items-center gap-1 bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                    title={dict.galleryHostOnlyBadge}
                  >
                    <EyeOff className="size-3" />
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => setTarget(photo.photoId)}
                  aria-label={dict.photoDeleteAction}
                  className="absolute right-1 top-1 inline-flex size-7 items-center justify-center bg-black/60 text-white opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
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
