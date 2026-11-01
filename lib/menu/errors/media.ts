// ScanMe Menu V1 (K15) — machine codes of the article image upload (master
// §7.9). Dependency-free like ./core.ts; the Serbian text lives in the
// `menu-domen` dictionary (`errors[code]`).

export const MENU_MEDIA_ERROR = {
  /** Larger than 10 MB (lib/menu/image-validation.ts). */
  tooLarge: "media/too_large",
  /** Not a JPEG, PNG or WebP image. */
  wrongType: "media/wrong_type",
  /** An iPhone HEIC/HEIF photo: export it as JPG first. */
  heic: "media/heic",
  /** The file has no bytes, or the uploaded blob is missing. */
  empty: "media/empty",
  /** The upload is not in the state this step needs (already processed, failed or another blob). */
  wrongState: "media/wrong_state",
  /** Too many uploads for one menu within the hour. */
  tooMany: "media/too_many",
  /** The image could not be read or turned into web versions. */
  unreadable: "media/unreadable",
  /** The pipeline secret is missing on the deployment (image processing is off). */
  disabled: "media/disabled",
  /** The caller is not the Next.js image route. */
  invalidSecret: "media/invalid_secret",
} as const;

export type MenuMediaErrorCode = (typeof MENU_MEDIA_ERROR)[keyof typeof MENU_MEDIA_ERROR];
