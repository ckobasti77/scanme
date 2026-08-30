// Dev-only harness for the TASK-22 live wall. It renders the REAL WallCanvas
// (the same windowing / staging / mosaic / wake-lock code the projected wall
// runs) driven by a synthetic feed of realistically-sized canvas images, so the
// duration + memory run, the mixed-orientation handling, the staged-arrival
// moment, and the QR can all be exercised offline, without a live Convex
// deployment or the real image pipeline. Prod-404, mirroring the other dev
// harnesses. The only thing mocked is the data source; the rendering is real.

import { notFound } from "next/navigation";
import { WallHarness } from "./wall-harness";

export const dynamic = "force-dynamic";

export default async function WallHarnessPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <WallHarness />;
}
