"use client";

import { useState } from "react";

export function useRetainedQueryResult<T>(value: T | undefined, scopeKey: string | null) {
  const [retained, setRetained] = useState<{ scopeKey: string; value: T } | null>(null);

  if (
    scopeKey !== null
    && value !== undefined
    && (retained?.scopeKey !== scopeKey || !Object.is(retained.value, value))
  ) {
    setRetained({ scopeKey, value });
  }

  if (value !== undefined) return value;
  return retained?.scopeKey === scopeKey ? retained.value : undefined;
}
