import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";

// TASK-17 — shared view-payload types for the guest surfaces, derived from the
// Convex queries themselves so the UI can never drift from the server shape.

export type GuestSpaceView = NonNullable<
  FunctionReturnType<typeof api.memories.guestSpaceView>
>;

export type MyPhotosView = FunctionReturnType<typeof api.memories.myPhotosView>;

export type MyPhotoView = MyPhotosView[number];

export type PublicGalleryView = NonNullable<
  FunctionReturnType<typeof api.memories.publicGalleryView>
>;

export type PhotoImage = MyPhotoView["image"];
