"use client";

// ScanMe Menu V1 — the browser side of an article image upload (K15; the
// protocol is in convex/menuMedia.ts). The original goes straight to the
// Convex upload URL (XHR, for the progress bar); then the route
// /api/meni/slike makes the web versions and makes the image the article's
// image in the draft. Both answers are reduced to a storage id or a machine
// code the editor can word.

/** POSTs the file to a Convex upload URL; resolves the storage id, or null on any failure. */
export function posaljiOriginal(
  url: string,
  fajl: Blob,
  tip: string,
  onUdeo: (udeo: number) => void,
): Promise<string | null> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Content-Type", tip);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onUdeo(Math.min(1, event.loaded / event.total));
    };
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) return resolve(null);
      try {
        const body = JSON.parse(xhr.responseText) as { storageId?: unknown };
        resolve(typeof body.storageId === "string" ? body.storageId : null);
      } catch {
        resolve(null);
      }
    };
    xhr.onerror = () => resolve(null);
    xhr.onabort = () => resolve(null);
    xhr.send(fajl);
  });
}

export type ObradaOdgovor = { ok: true; slikaId: string } | { ok: false; kod: string | null };

/** Asks /api/meni/slike to process the stored original (the session cookie says who asks). */
export async function obradiNaServeru(uploadId: string, storageId: string): Promise<ObradaOdgovor> {
  try {
    const response = await fetch("/api/meni/slike", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploadId, storageId }),
    });
    const body = (await response.json().catch(() => ({}))) as { ok?: unknown; mediaId?: unknown; code?: unknown };
    if (response.ok && body.ok === true && typeof body.mediaId === "string") return { ok: true, slikaId: body.mediaId };
    return { ok: false, kod: typeof body.code === "string" ? body.code : null };
  } catch {
    return { ok: false, kod: null };
  }
}
