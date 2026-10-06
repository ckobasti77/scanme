// B6/A8 — a file rendered by an admin-only Convex action ({ fileName,
// mimeType, chunks }) is downloaded in the browser; nothing is parked
// anywhere. Shared by Izveštaji (reports) and Leadovi (PII hand-over).

export type AdminFileResult = { fileName: string; mimeType: string; chunks: ArrayBuffer[] };

export function downloadAdminFile(result: AdminFileResult) {
  const blob = new Blob(result.chunks, { type: result.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = result.fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
