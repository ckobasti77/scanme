"use client";

// The synthetic driver for the live-wall memory/duration run. It maintains a
// ROLLING window of at most WINDOW photos (mirroring the server's .take() cap),
// generating a fresh, realistically-sized raster image per "upload" and revoking
// the blob URL of whatever scrolls out of the window — so a dropped photo's
// decoded bitmap is actually freed, exactly as the production window does. It
// hands that window to the real WallCanvas.
//
// A `window.__wall` control surface lets the browser driver add photos, simulate
// a network drop (feed → undefined, which WallCanvas rides out), and sample the
// live stats used for docs/perf/memories-wall.md.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  WallCanvas,
  type WallFeed,
  type WallMeta,
} from "@/components/memories/wall/wall-screen";
import type { PhotoImage } from "@/components/memories/memories-view";
import type { Id } from "@/convex/_generated/dataModel";

// Must match WALL_WINDOW in convex/memoriesWall.ts — this stands in for the
// server-side .take() bound.
const WINDOW = 60;

// Realistic photo geometries: landscape, portrait, and square, so the harness
// exercises the mixed-orientation frame (contain + blurred fill) and decodes
// full-size bitmaps like the real pipeline's outputs.
const GEOMETRIES: Array<[number, number]> = [
  [1600, 1200],
  [1200, 1600],
  [1500, 1500],
  [2048, 1152],
  [1152, 2048],
];

const HUES = [18, 32, 45, 8, 200, 340, 160, 280];

type HarnessPhoto = WallFeed["photos"][number] & {
  revoke: () => void;
};

async function makePhoto(seq: number): Promise<HarnessPhoto> {
  const [w, h] = GEOMETRIES[seq % GEOMETRIES.length];
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const hue = HUES[seq % HUES.length];
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, `hsl(${hue} 55% 32%)`);
  grad.addColorStop(1, `hsl(${(hue + 40) % 360} 60% 18%)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  // A big legible index so rotation/arrival is visible on screen.
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = `bold ${Math.floor(Math.min(w, h) * 0.28)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(seq), w / 2, h / 2);

  const blob: Blob = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b as Blob), "image/webp", 0.82),
  );
  const url = URL.createObjectURL(blob);
  const image: PhotoImage = {
    thumbUrl: url,
    avifUrl: url,
    webpUrl: url,
    width: w,
    height: h,
    thumbWidth: w,
    thumbHeight: h,
  };
  return {
    photoId: `p${seq}` as Id<"memoriesPhotos">,
    createdAt: Date.now() + seq,
    image,
    revoke: () => URL.revokeObjectURL(url),
  };
}

const SESSION_ID = "sess" as Id<"memoriesSessions">;

const META: WallMeta = {
  spaceName: "Kod Šarana — uspomene",
  businessName: "Kafana Kod Šarana",
  joinCode: "DEMO2345",
  requiresApproval: false,
  session: { id: SESSION_ID, status: "open" },
};

export function WallHarness() {
  const [photos, setPhotos] = useState<HarnessPhoto[]>([]);
  const [total, setTotal] = useState(0);
  // A dropped connection: Convex keeps returning the LAST value, so the drop is
  // modelled by freezing the feed snapshot, not by handing WallCanvas undefined.
  const [frozen, setFrozen] = useState<WallFeed | null>(null);
  const seqRef = useRef(0);
  const totalRef = useRef(0); // read only by getStats (never during render)

  const addPhotos = useCallback(async (n: number) => {
    for (let i = 0; i < n; i++) {
      const photo = await makePhoto(seqRef.current++);
      totalRef.current += 1;
      setTotal((t) => t + 1);
      setPhotos((prev) => {
        const next = [photo, ...prev];
        // Enforce the window: revoke and drop everything past WINDOW so the
        // dropped bitmaps are freed (this is the "drop what scrolled past").
        while (next.length > WINDOW) {
          const dropped = next.pop();
          dropped?.revoke();
        }
        return next;
      });
    }
  }, []);

  const liveFeed: WallFeed = useMemo(
    () => ({
      photos: photos.map(({ photoId, createdAt, image }) => ({
        photoId,
        createdAt,
        image,
      })),
      sessionId: SESSION_ID,
      count: total,
    }),
    [photos, total],
  );
  const feed = frozen ?? liveFeed;
  const paused = frozen !== null;
  const toggleDrop = () =>
    setFrozen((f: WallFeed | null) => (f ? null : liveFeed));

  // Expose the driver surface for the browser measurement script.
  useEffect(() => {
    const perf = performance as Performance & {
      memory?: { usedJSHeapSize: number };
    };
    const api = {
      addPhotos: (n: number) => addPhotos(n),
      getStats: () => {
        // All <img> on the page are wall photos (the QR is an <svg>), so
        // document.images is the rendered-photo set — bounded by the mosaic +
        // stage regardless of how many photos have flowed through.
        const imgs = Array.from(document.images);
        const megapixels = imgs.reduce(
          (sum, img) => sum + (img.naturalWidth * img.naturalHeight) / 1e6,
          0,
        );
        return {
          totalGenerated: totalRef.current,
          windowSize: Math.min(totalRef.current, WINDOW),
          renderedImgs: imgs.length,
          renderedMegapixels: Math.round(megapixels * 10) / 10,
          jsHeapMB: perf.memory
            ? Math.round((perf.memory.usedJSHeapSize / 1048576) * 10) / 10
            : null,
        };
      },
    };
    (window as unknown as { __wall: typeof api }).__wall = api;
  }, [addPhotos]);

  return (
    <>
      <WallCanvas
        feed={feed}
        meta={META}
        joinUrl="https://scanme.rs/m/DEMO2345"
      />
      {/* Dev controls, above the wall (which is z-200 and hides the cursor). */}
      <div
        style={{
          position: "fixed",
          top: 8,
          left: 8,
          zIndex: 300,
          display: "flex",
          gap: 6,
          padding: 8,
          background: "rgba(0,0,0,0.6)",
          borderRadius: 8,
          cursor: "auto",
          fontFamily: "monospace",
          fontSize: 12,
          color: "#fff",
        }}
      >
        <button type="button" onClick={() => void addPhotos(1)}>
          +1
        </button>
        <button type="button" onClick={() => void addPhotos(10)}>
          +10
        </button>
        <button type="button" onClick={toggleDrop}>
          {paused ? "reconnect" : "drop net"}
        </button>
        <span>
          win {photos.length} · total {total}
        </span>
      </div>
    </>
  );
}
