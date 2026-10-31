// Latest-wins save of the brand favorite (stamp passport heart, 31 Oct 2026).
// The heart updates at once on every tap; the server only ever gets the last
// choice: taps are debounced, at most one request is in flight, and when it
// returns while a newer choice is waiting, the newer one is sent next. So the
// requests reach the server in tap order and the last tap is what is saved.
// A failed final request rolls back to the last choice the server confirmed.

export type FavoriteSync = {
  /** A tap: the new desired favorite (already shown by the caller). */
  choose(modelId: string): void;
  /** Unmount: a pending (debounced) choice is still sent, never dropped. */
  dispose(): void;
};

export function createFavoriteSync<R>(options: {
  confirmed: string | undefined;
  delayMs: number;
  send: (modelId: string) => Promise<R>;
  /** The last choice was saved; `result` is the server answer for it. */
  onSaved: (modelId: string, result: R) => void;
  /** The last choice failed; `confirmed` is what the server still holds. */
  onFailed: (confirmed: string | undefined) => void;
}): FavoriteSync {
  let confirmed = options.confirmed;
  let desired = confirmed;
  let inFlight = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  function flush() {
    timer = undefined;
    if (inFlight || desired === undefined || desired === confirmed) return;
    const sent = desired;
    inFlight = true;
    options.send(sent).then(
      (result) => {
        inFlight = false;
        confirmed = sent;
        if (desired !== sent) {
          if (!timer) flush();
          return;
        }
        if (!disposed) options.onSaved(sent, result);
      },
      () => {
        inFlight = false;
        if (desired !== sent) {
          if (!timer) flush();
          return;
        }
        desired = confirmed;
        if (!disposed) options.onFailed(confirmed);
      },
    );
  }

  return {
    choose(modelId) {
      desired = modelId;
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, options.delayMs);
    },
    dispose() {
      disposed = true;
      if (timer) {
        clearTimeout(timer);
        flush();
      }
    },
  };
}
