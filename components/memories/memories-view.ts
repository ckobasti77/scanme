import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";

// TASK-17 — shared view-payload types for the guest surfaces, derived from the
// Convex queries themselves so the UI can never drift from the server shape.

export type GuestSpaceView = NonNullable<
  FunctionReturnType<typeof api.memories.guestSpaceView>
>;

export type MyPhotosView = FunctionReturnType<typeof api.memories.myPhotosView>;

export type MyPhotoView = MyPhotosView[number];

// TASK-20 STEP 0 — the public gallery split: meta (header + host gate) and a
// cursor-paginated photo page. The old single PublicGalleryView is gone.
export type PublicGalleryMeta = NonNullable<
  FunctionReturnType<typeof api.memories.publicGalleryMeta>
>;

export type GalleryPhoto = FunctionReturnType<
  typeof api.memories.publicGalleryPage
>["page"][number];

export type PhotoImage = MyPhotoView["image"];
