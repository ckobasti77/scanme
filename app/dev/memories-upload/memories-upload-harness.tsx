"use client";

// The client half of the TASK-16 dev harness. Bare on purpose: a file input,
// a monospace table, and an event log — enough to watch the queue mechanism
// (states, retries, releases, kicks) with the phone locked and unlocked. No
// design decisions here; TASK-17 owns the real screen.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createUploadBackend,
  MemoriesUploadQueue,
  type QueueSnapshot,
  type UploadQueueEvent,
} from "@/lib/memories-client";

// Keyed by the code it was resolved FOR: while `identity.code !== code` the
// UI renders "checking" without any synchronous state reset in the effect.
interface Identity {
  code: string;
  status: "missing" | "ok";
  guestKey: string | null;
}

const MONO: React.CSSProperties = {
  fontFamily: "ui-monospace, monospace",
  fontSize: 12,
};

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "–";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

function formatClock(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}.${String(
    d.getMilliseconds(),
  ).padStart(3, "0")}`;
}

export function MemoriesUploadHarness({
  initialCode,
  convexUrl,
}: {
  initialCode: string;
  convexUrl: string;
}) {
  const [code, setCode] = useState(initialCode);
  const [identity, setIdentity] = useState<Identity>({
    code: "",
    status: "missing",
    guestKey: null,
  });
  const [snapshot, setSnapshot] = useState<QueueSnapshot>({
    items: [],
    quota: null,
    hasPendingWork: false,
  });
  const [log, setLog] = useState<string[]>([]);
  // 1s ticker so the elapsed column moves between queue events without
  // impure Date.now() reads during render.
  const [now, setNow] = useState(() => Date.now());
  const queueRef = useRef<MemoriesUploadQueue | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const appendLog = useCallback((line: string) => {
    setLog((prev) => [...prev.slice(-499), line]);
  }, []);

  // Identity: the HttpOnly cookie can only be read server-side; whoami echoes
  // the verified guestKey back to this page's JS. All setState here is async
  // (inside the fetch continuation); "checking" is derived from
  // identity.code !== code.
  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    fetch(`/m/${encodeURIComponent(code)}/whoami`, { cache: "no-store" })
      .then(async (response) => {
        if (cancelled) return;
        if (!response.ok) {
          setIdentity({ code, status: "missing", guestKey: null });
          return;
        }
        const body = (await response.json()) as { guestKey?: unknown };
        setIdentity(
          typeof body.guestKey === "string"
            ? { code, status: "ok", guestKey: body.guestKey }
            : { code, status: "missing", guestKey: null },
        );
      })
      .catch(() => {
        if (!cancelled) {
          setIdentity({ code, status: "missing", guestKey: null });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const identityState: "checking" | "missing" | "ok" =
    identity.code === code && code ? identity.status : code ? "checking" : "missing";

  // The queue lives for as long as the identity does.
  useEffect(() => {
    if (
      identity.status !== "ok" ||
      identity.code !== code ||
      !identity.guestKey ||
      !convexUrl
    ) {
      return;
    }
    const queue = new MemoriesUploadQueue({
      backend: createUploadBackend({
        code,
        guestKey: identity.guestKey,
        convexUrl,
      }),
      onEvent: (event: UploadQueueEvent) => {
        appendLog(
          `${formatClock(event.at)} ${event.itemId?.slice(0, 8) ?? "queue---"} ${
            event.type
          }${event.detail ? ` ${event.detail}` : ""}`,
        );
      },
    });
    queueRef.current = queue;
    const unsubscribe = queue.subscribe(setSnapshot);
    return () => {
      unsubscribe();
      queue.dispose();
      queueRef.current = null;
    };
  }, [identity, code, convexUrl, appendLog]);

  // Page-level lifecycle events into the same log, so a lock/unlock run reads
  // as one timeline.
  useEffect(() => {
    const onVisibility = () =>
      appendLog(
        `${formatClock(Date.now())} page---- visibility=${document.visibilityState}`,
      );
    const onOnline = () =>
      appendLog(`${formatClock(Date.now())} page---- online`);
    const onOffline = () =>
      appendLog(`${formatClock(Date.now())} page---- offline`);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [appendLog]);

  const onPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const queue = queueRef.current;
    const files = event.target.files;
    if (!queue || !files || files.length === 0) return;
    queue.enqueue(Array.from(files));
    event.target.value = "";
  };

  return (
    <main style={{ padding: 16, ...MONO }}>
      <h1 style={{ fontSize: 14, fontWeight: 700 }}>
        memories-upload harness (TASK-16 · dev only · not the guest page)
      </h1>

      <section style={{ marginTop: 12 }}>
        <label>
          space code{" "}
          <input
            style={MONO}
            value={code}
            onChange={(event) => setCode(event.target.value.trim())}
            placeholder="ABCD2345"
          />
        </label>{" "}
        <span data-testid="identity">
          identity:{" "}
          {identityState === "ok"
            ? `ok guestKey=${identity.guestKey?.slice(0, 8)}…`
            : identityState}
        </span>
        {identityState === "missing" && code !== "" && (
          <div>
            no guest cookie for this code — visit /r/[cardCode] for a card
            targeting this space first (npx convex run memoriesDevSeed:seed)
          </div>
        )}
      </section>

      <section style={{ marginTop: 12 }}>
        <input
          data-testid="file-input"
          type="file"
          accept="image/*"
          multiple
          disabled={identityState !== "ok"}
          onChange={onPick}
        />
        {snapshot.quota && (
          <span data-testid="quota">
            {" "}
            quota: {snapshot.quota.remaining}/{snapshot.quota.limit} remaining
          </span>
        )}
      </section>

      <table
        data-testid="items"
        style={{ marginTop: 12, borderCollapse: "collapse", width: "100%" }}
      >
        <thead>
          <tr>
            {[
              "name",
              "state",
              "phase",
              "attempt",
              "progress",
              "bytes in→out",
              "dims",
              "elapsed",
              "photoId",
              "error",
              "",
            ].map((h) => (
              <th
                key={h}
                style={{
                  textAlign: "left",
                  borderBottom: "1px solid #999",
                  padding: "2px 6px",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {snapshot.items.map((item) => {
            const elapsedMs = (item.finishedAt ?? now) - item.enqueuedAt;
            return (
              <tr key={item.id} data-state={item.state}>
                <td style={{ padding: "2px 6px" }}>{item.name}</td>
                <td style={{ padding: "2px 6px" }} data-testid="state">
                  {item.state}
                </td>
                <td style={{ padding: "2px 6px" }}>{item.phase}</td>
                <td style={{ padding: "2px 6px" }}>{item.attempt}</td>
                <td style={{ padding: "2px 6px" }}>
                  {Math.round(item.progress * 100)}%
                </td>
                <td style={{ padding: "2px 6px" }}>
                  {formatBytes(item.sourceBytes)}→
                  {formatBytes(item.preparedBytes)}
                  {item.sourceFormat ? ` (${item.sourceFormat})` : ""}
                </td>
                <td style={{ padding: "2px 6px" }}>
                  {item.width && item.height
                    ? `${item.width}×${item.height}`
                    : "–"}
                </td>
                <td style={{ padding: "2px 6px" }}>
                  {(elapsedMs / 1000).toFixed(1)}s
                </td>
                <td style={{ padding: "2px 6px" }}>
                  {item.photoId ? `${item.photoId.slice(0, 10)}…` : "–"}
                </td>
                <td style={{ padding: "2px 6px" }}>{item.errorMessage ?? ""}</td>
                <td style={{ padding: "2px 6px", whiteSpace: "nowrap" }}>
                  {item.state === "failed" && item.canRetry && (
                    <button
                      style={MONO}
                      onClick={() => queueRef.current?.retry(item.id)}
                    >
                      retry
                    </button>
                  )}{" "}
                  {item.state !== "ready" && (
                    <button
                      style={MONO}
                      onClick={() => queueRef.current?.remove(item.id)}
                    >
                      remove
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <pre
        data-testid="log"
        style={{
          marginTop: 12,
          maxHeight: 320,
          overflow: "auto",
          background: "#f4f4f4",
          padding: 8,
          whiteSpace: "pre-wrap",
        }}
      >
        {log.join("\n")}
      </pre>
    </main>
  );
}
