// ScanMe Menu V1 (K15) — which file may become the image of an article
// (master §7.9: one main image per article, up to 10 MB, a web format and
// responsive sizes up to about 2.400 px, no metadata). The editor checks the
// file before anything is uploaded, and the server checks the stored blob
// again (convex/menuMedia.ts): the browser's check is only for a fast, clear
// message, never the guard.
//
// Accepted: JPEG, PNG and WebP — what every phone and camera exports and what
// the server transform (sharp, lib/menu/http/image-transform.ts) decodes on
// every platform. HEIC is refused with its own message: the prebuilt sharp
// does not decode it, and phones offer "JPG" / "Most compatible" on export.

/** 10 MB (master §7.9), in bytes. */
export const MENU_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

/** The longest side of the stored image (master §7.9: "oko 2.400 px"). */
export const MENU_IMAGE_MAX_DIMENSION = 2400;

export const MENU_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type MenuImageType = (typeof MENU_IMAGE_TYPES)[number];

/** The `accept` attribute of the file input. */
export const MENU_IMAGE_ACCEPT = MENU_IMAGE_TYPES.join(",");

const EXTENSION_TYPES: Readonly<Record<string, MenuImageType>> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jfif: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const HEIC = /^(image\/(heic|heif)(-sequence)?)$/;
const HEIC_EXTENSION = /\.(heic|heif)$/i;

export type MenuImageProblem =
  /** No bytes at all (a broken export or a cloud placeholder). */
  | "empty"
  /** Larger than MENU_IMAGE_MAX_BYTES. */
  | "too_large"
  /** An iPhone HEIC/HEIF photo: say how to export it instead. */
  | "heic"
  /** Not an image the menu takes (PDF, GIF, SVG, video…). */
  | "wrong_type";

export type MenuImageCheck =
  | { ok: true; type: MenuImageType }
  | { ok: false; problem: MenuImageProblem };

/**
 * The type of a file as the browser reports it, falling back to the name's
 * extension when the browser reports nothing (some Android pickers do).
 */
export function menuImageType(file: { type: string; name: string }): MenuImageType | "heic" | null {
  const reported = file.type.trim().toLowerCase();
  if (HEIC.test(reported) || HEIC_EXTENSION.test(file.name)) return "heic";
  if ((MENU_IMAGE_TYPES as readonly string[]).includes(reported)) return reported as MenuImageType;
  if (reported !== "" && reported !== "application/octet-stream") return null;
  const extension = /\.([a-z0-9]+)$/i.exec(file.name.trim())?.[1]?.toLowerCase();
  return extension ? (EXTENSION_TYPES[extension] ?? null) : null;
}

/** Checks one chosen file: type first (a 20 MB PDF is "wrong type", not "too large"), then size. */
export function checkMenuImage(file: { type: string; name: string; size: number }): MenuImageCheck {
  const type = menuImageType(file);
  if (type === "heic") return { ok: false, problem: "heic" };
  if (type === null) return { ok: false, problem: "wrong_type" };
  if (!Number.isFinite(file.size) || file.size <= 0) return { ok: false, problem: "empty" };
  if (file.size > MENU_IMAGE_MAX_BYTES) return { ok: false, problem: "too_large" };
  return { ok: true, type };
}

/** The server's check of a stored blob (its `_storage` metadata): the same rules, without a name. */
export function checkStoredMenuImage(meta: { contentType?: string | null; size: number }): MenuImageCheck {
  return checkMenuImage({ type: meta.contentType ?? "", name: "", size: meta.size });
}

/** Megabytes with one decimal and a decimal comma, for messages ("14,2"). */
export function formatMegabytes(bytes: number): string {
  const tenths = Math.max(1, Math.round(bytes / (1024 * 1024) * 10));
  const whole = Math.floor(tenths / 10);
  return `${whole},${tenths % 10}`;
}
