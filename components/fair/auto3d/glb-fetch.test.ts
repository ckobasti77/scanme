// Preuzimanje GLB-a sa napretkom (A12; A13: nije bilo testirano): delovi se spajaju redom, napredak
// raste do ukupne veličine, bez content-length ukupno je null, a HTTP greška odbija obećanje.

import { afterEach, describe, expect, test, vi } from "vitest";
import { fetchModel } from "./glb-fetch";

function streamOf(chunks: number[][]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(new Uint8Array(ch));
      c.close();
    },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("fetchModel", () => {
  test("spaja delove redom i javlja napredak do ukupne veličine", async () => {
    const fetchMock = vi.fn(async () => new Response(streamOf([[1, 2], [3], [4, 5, 6]]), { headers: { "content-length": "6" } }));
    vi.stubGlobal("fetch", fetchMock);
    const progress: Array<[number, number | null]> = [];
    const signal = new AbortController().signal;
    const buf = await fetchModel("/3d/auto3d/limuzina.glb", (l, t) => progress.push([l, t]), signal);
    expect([...new Uint8Array(buf)]).toEqual([1, 2, 3, 4, 5, 6]);
    expect(progress).toEqual([
      [2, 6],
      [3, 6],
      [6, 6],
    ]);
    expect(fetchMock).toHaveBeenCalledWith("/3d/auto3d/limuzina.glb", { signal });
  });

  test("bez content-length ukupno je null", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(streamOf([[7, 8]]))));
    const totals: Array<number | null> = [];
    const buf = await fetchModel("/m.glb", (_l, t) => totals.push(t), new AbortController().signal);
    expect(buf.byteLength).toBe(2);
    expect(totals).toEqual([null]);
  });

  test("HTTP greška odbija obećanje", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nema", { status: 404 })));
    await expect(fetchModel("/nema.glb", () => {}, new AbortController().signal)).rejects.toThrow(/HTTP 404/);
  });
});
