"use client";

// Media upload control (TASK-12 STEP 2): pick → validate → POST to a Convex
// upload URL with real progress → hand the storage id to the caller. The owner
// is never left unsure whether an image saved: the tile is always in exactly
// one of empty / uploading (with percent) / failed (with retry) / saved
// (thumbnail visible). Failure keeps the picked file so retry is one tap.

import { ImagePlus, RefreshCw, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { fmt } from "@/lib/i18n";
import { venueEditorSr as dict } from "@/lib/i18n/sr/venue-editor";
import { useVenuePanelServices } from "./venue-editor-panel-context";
import styles from "./venue-editor.module.css";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/webm"];
const IMAGE_MAX_MB = 8;
const VIDEO_MAX_MB = 60;

// POST a file to a Convex upload URL with real progress events (fetch has no
// upload progress, hence XHR). Resolves to the new storage id.
export function postFileWithProgress(
  url: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const body = JSON.parse(xhr.responseText) as { storageId: string };
          resolve(body.storageId);
        } catch {
          reject(new Error(dict.uploadFailed));
        }
      } else {
        reject(new Error(dict.uploadFailed));
      }
    };
    xhr.onerror = () => reject(new Error(dict.uploadFailed));
    xhr.send(file);
  });
}

type UploadState =
  | { phase: "idle" }
  | { phase: "uploading"; percent: number }
  | { phase: "error"; message: string };

export function MediaUploadTile({
  kind,
  storageId,
  onUploaded,
  onRemove,
  label,
  previewUrl: previewUrlProp,
}: {
  kind: "image" | "video";
  storageId: string | undefined;
  onUploaded: (storageId: string) => void;
  /** Absent ⇒ the field is required-ish and offers only replace. */
  onRemove?: () => void;
  label?: string;
  /** For top-level media (logo, backgrounds) the editor query resolves a URL
   * directly instead of an id → URL map entry; pass it here. */
  previewUrl?: string | null;
}) {
  const services = useVenuePanelServices();
  const inputRef = useRef<HTMLInputElement>(null);
  const lastFileRef = useRef<File | null>(null);
  // The id this tile itself uploaded last — preferred for display so a fresh
  // upload shows instantly even when previewUrl (from the server) is stale.
  const [uploadedId, setUploadedId] = useState<string | null>(null);
  const [state, setState] = useState<UploadState>({ phase: "idle" });

  const previewUrl =
    (uploadedId ? services.mediaUrls[uploadedId] : undefined) ??
    (storageId ? services.mediaUrls[storageId] : undefined) ??
    previewUrlProp ??
    null;
  const allowed = kind === "image" ? IMAGE_TYPES : VIDEO_TYPES;
  const maxMb = kind === "image" ? IMAGE_MAX_MB : VIDEO_MAX_MB;
  const addLabel =
    label ?? (kind === "image" ? dict.uploadImageAction : dict.uploadVideoAction);

  async function startUpload(file: File) {
    if (!allowed.includes(file.type)) {
      setState({
        phase: "error",
        message:
          kind === "image" ? dict.uploadInvalidImage : dict.uploadInvalidVideo,
      });
      return;
    }
    if (file.size > maxMb * 1024 * 1024) {
      setState({
        phase: "error",
        message: fmt(dict.uploadTooLarge, { max: maxMb }),
      });
      return;
    }
    lastFileRef.current = file;
    setState({ phase: "uploading", percent: 0 });
    try {
      const newId = await services.upload(file, (percent) =>
        setState({ phase: "uploading", percent }),
      );
      services.registerLocalMedia(newId, URL.createObjectURL(file));
      setUploadedId(newId);
      setState({ phase: "idle" });
      onUploaded(newId);
    } catch {
      setState({ phase: "error", message: dict.uploadFailed });
    }
  }

  function handlePick(files: FileList | null) {
    const file = files?.[0];
    if (file) void startUpload(file);
    // Allow re-picking the same file after a failure.
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className={styles.uploadTile} data-has-media={Boolean(previewUrl) || undefined}>
      <input
        ref={inputRef}
        className={styles.uploadInput}
        type="file"
        accept={allowed.join(",")}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => handlePick(event.target.files)}
      />
      {previewUrl && kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.uploadThumb} src={previewUrl} alt="" />
      ) : previewUrl && kind === "video" ? (
        <video className={styles.uploadThumb} src={previewUrl} muted playsInline />
      ) : null}

      {state.phase === "uploading" ? (
        <div className={styles.uploadStatus} role="status">
          <span>{fmt(dict.uploadProgress, { percent: state.percent })}</span>
          <span className={styles.uploadTrack} aria-hidden="true">
            <span
              className={styles.uploadFill}
              style={{ width: `${state.percent}%` }}
            />
          </span>
        </div>
      ) : state.phase === "error" ? (
        <div className={styles.uploadStatus} data-tone="error">
          <p role="alert" className={styles.fieldError}>
            {state.message}
          </p>
          <button
            type="button"
            className={styles.uploadAction}
            onClick={() => {
              const file = lastFileRef.current;
              if (file) void startUpload(file);
              else inputRef.current?.click();
            }}
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            {dict.uploadRetryAction}
          </button>
        </div>
      ) : (
        <div className={styles.uploadActions}>
          <button
            type="button"
            className={styles.uploadAction}
            onClick={() => inputRef.current?.click()}
          >
            <ImagePlus className="size-3.5" aria-hidden="true" />
            {previewUrl ? dict.uploadReplaceAction : addLabel}
          </button>
          {onRemove && previewUrl ? (
            <button
              type="button"
              className={styles.uploadAction}
              data-tone="danger"
              onClick={() => {
                setUploadedId(null);
                onRemove();
              }}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              {dict.uploadRemoveAction}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
