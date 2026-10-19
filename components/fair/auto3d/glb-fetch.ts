// Preuzimanje GLB-a sa napretkom, bez three-a (A03 §1.4, A12): ostrvo ga pokreće istovremeno sa
// dinamičkim uvozom ./viewer, pa model i three stižu paralelno, a pregledač dobija gotov bafer.

export async function fetchModel(
  url: string,
  onProgress: (loaded: number, total: number | null) => void,
  signal: AbortSignal,
): Promise<ArrayBuffer> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`GLB ${url}: HTTP ${res.status}`);
  const header = Number(res.headers.get("content-length"));
  const total = Number.isFinite(header) && header > 0 ? header : null;
  if (!res.body) {
    const buf = await res.arrayBuffer();
    onProgress(buf.byteLength, buf.byteLength);
    return buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress(loaded, total);
  }
  const out = new Uint8Array(loaded);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out.buffer;
}
