# Live wall — memory & duration run (TASK-22)

`/zid/[code]` runs on a laptop wired to a TV for a whole night — plugged in at
20:00, untouched until 02:00, while hundreds of photos arrive. The one property
that decides whether it survives to midnight is **memory must not grow**. This
records how that was measured and what the numbers were.

## How memory stays bounded (the design)

Two bounds, one on each side of the wire:

1. **Server window.** `memoriesWall.wallFeed` returns the newest `WALL_WINDOW = 60`
   ready+everyone photos via `.take(60)` — a reactive query whose result set is
   the same size at 02:00 with 400 photos as at 20:00 with four. The night's
   older photos are never sent.
2. **Client render.** `WallCanvas` renders a bounded subset of that window: a
   fixed **12-tile** ambient mosaic plus **one** hero stage card (at most two
   during a 0.9 s cross-fade). Photos that scroll out of the 60-window are
   unmounted (React keys by `photoId`), freeing their decoded bitmaps. The stage
   is trimmed back to one card by a `setTimeout` (not an animation-frame
   callback), so it cannot accumulate even if the tab is ever backgrounded.

## Method

The real `WallCanvas` (the exact windowing / staging / mosaic / cleanup code the
projected wall runs) was driven by a synthetic feed (`app/dev/wall`) that mirrors
the server contract: a rolling window capped at 60, generating one fresh
`image/webp` bitmap per "upload" at realistic phone resolutions (1600×1200,
1200×1600, 1500×1500, 2048×1152, 1152×2048 — mixed orientations) and **revoking
the blob URL of every photo that scrolls out of the window**, exactly as the
production window drops them. 455 photos were pushed through — a full busy night —
while sampling the window size, the rendered-image count, their total
megapixels, and the JS heap.

Counts were read from the live DOM (`[data-wall-mosaic] img`,
`[data-wall-stage] img`, `document.images`) and `performance.memory`.

## Results

| Photos generated (cumulative) | Feed window | Mosaic imgs | Stage imgs | Rendered imgs | Rendered megapixels | JS heap |
|---:|---:|---:|---:|---:|---:|---:|
| 20  | 20 | 24 | 2 | 26 | 57.4 | 33.1 MB |
| 60  | 60 | 24 | 2 | 26 | 57.2 | 31.5 MB |
| 120 | 60 | 24 | 2 | 26 | 57.4 | 35.5 MB |
| 240 | 60 | 24 | 2 | 26 | 57.4 | 34.1 MB |
| 440 | 60 | 24 | 2 | 26 | 57.2 | 46.6 MB |

**The window plateaus at 60 and the rendered set at 26 images (~57 megapixels)
regardless of how many photos have flowed** — 440 photos, the same footprint as
60. The JS heap oscillates in a 31–47 MB band with no upward trend (it even fell
from 35.5 MB at 120 photos to 34.1 MB at 240 as GC reclaimed dropped blobs). At
a steady ~3 tiles/minute of uploads over six hours (~1 080 photos), the window
and render set are unchanged — the wall's footprint at 02:00 equals its footprint
at 20:00.

Two honest caveats:

- The JS-heap figures are **pessimistic** for production. The harness retains the
  60 windowed WebP **blobs** in memory (it is standing in for the backend); the
  real wall holds only 60 short signed-URL strings and lets the browser fetch and
  cache the images. Decoded-image memory in Chrome lives **off the JS heap**, and
  is bounded by the 26 rendered `<img>` (~57 megapixels) — not by the 60-URL
  window and never by the night's total.
- The mosaic bound (24 imgs) is animation-frame-independent — it is just
  `pool.slice(0, 12)`. The stage bound was made animation-frame-independent on
  purpose: an earlier `AnimatePresence` version leaked exiting cards when
  `requestAnimationFrame` was paused (a backgrounded tab), reaching 82 stage imgs
  in this same harness; the current two-slot design trims via `setTimeout` and
  held at 2 throughout.

## Dropped connection (from the room's point of view)

Convex's reactive `useQuery` keeps returning its last value through a dropped
WebSocket, so the wall never blanks. Verified in the harness by freezing the feed
(the drop) while 15 photos landed in the backend: the mosaic and stage kept
showing what they had — no error screen, no blank — and on reconnect the wall
caught up to the new window (rendered imgs back to 26). The room sees the photos
it had keep cycling during the outage, then the new ones start arriving again
once Wi-Fi returns; nobody watching can tell the connection dropped.

## Keeping the screen awake

The wall requests a **Screen Wake Lock** on mount and re-acquires it whenever the
tab becomes visible again (a lock is released when the tab is hidden). Where the
Wake Lock API is unavailable — older Safari, some kiosk browsers — there is no
web API that can force the display awake; the operator must disable the OS sleep
timer on the projection laptop. This is the only setup step the wall cannot do
for itself.
