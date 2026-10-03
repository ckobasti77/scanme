# Menu export — PDF / Excel size and the action ceiling (TASK-58)

_RFC-003 §2.9, §3 Risk 6. Measured by `lib/menu-export/bench.test.ts`:
`RUN_MENU_EXPORT_BENCH=1 npx vitest run lib/menu-export/bench.test.ts`
(vitest edge-runtime env, Node v22.23.2, this dev box). The writers are the
shipped ones — `lib/menu-export/pdf.ts` and `lib/menu-export/xlsx.ts` — and
the action (`convex/menuExport.ts`) is a thin wrapper around them, so these
bytes are the bytes the browser receives._

## The shape (why there is no memory story to tell)

The Memories ZIP export (docs/perf/memories-export.md) hit the **512 MiB
`"use node"` action ceiling** because it assembled hundreds of MiB of JPEGs in
one action. A menu export is text: at the hard cap of **2000 items**
(`MENU_MAX_ITEMS`, the public read's ~2045-item databaseQueries ceiling from
docs/perf/menu-publish-ceiling.md) a menu is single-digit MiB even when every
text bound is maxed. So the design is deliberately simple:

- **derive at export** from the queried draft model (one document read via
  `ctx.runQuery`, no per-item fan-out, `requireAdmin` inside the query);
- **no storage, no R2/CDN**: the bytes go back to the browser as
  `v.array(v.bytes())` in ≤ 900 000-byte chunks (Convex's 1 MiB per-value
  limit; the array IS the stream), reassembled into a `Blob` and downloaded;
- **default Convex runtime**, not Node: both writers are Uint8Array /
  DataView / TextEncoder only (no zlib — PDF streams are uncompressed, the
  XLSX is a STORE zip on `lib/memories-export/zip.ts`).

## The numbers

"Typical" = ~15-char names, one 35-char description line, 0–2 variants.
"Pathological" = every bound maxed: 120-char names, 600-char descriptions,
20 variants per item (`TEXT_MAX`, `MAX_VARIANTS_PER_ITEM`). RSS delta is the
process delta around building both files (a conservative upper bound: it
includes the model itself and GC noise).

| Items | Scenario | PDF | Pages | PDF build | XLSX | XLSX build | Chunks (pdf / xlsx) | RSS delta |
|---:|---|---:|---:|---:|---:|---:|---|---:|
| 100 | typical | 38 KiB | 7 | 9 ms | 51 KiB | 5 ms | 1 / 1 | 2.2 MiB |
| 100 | pathological | 442 KiB | 51 | 49 ms | 165 KiB | 5 ms | 1 / 1 | 11.9 MiB |
| 1000 | typical | 375 KiB | 63 | 34 ms | 475 KiB | 18 ms | 1 / 1 | 11.0 MiB |
| 1000 | pathological | 4406 KiB | 501 | 444 ms | 1616 KiB | 43 ms | 6 / 2 | 57.2 MiB |
| 2000 | typical | 751 KiB | 125 | 74 ms | 958 KiB | 39 ms | 1 / 2 | 7.4 MiB |
| **2000** | **pathological** | **8816 KiB** | 1001 | 744 ms | 3238 KiB | 48 ms | 11 / 4 | **73.7 MiB** |

## Verdict

- **Memory: three orders of magnitude of headroom.** The worst legal input
  (2000 items, every bound maxed) builds both files in < 1 s and < 75 MiB of
  process delta on the bench — against 512 MiB (Node) and comfortably inside
  the default runtime's budget. Real menus (the "typical" rows) are < 1 MiB.
- **The return path, not memory, is the constraint** — and it is handled: a
  single `v.bytes()` must stay under 1 MiB, so the action chunks at 900 000 B;
  the worst PDF is 11 chunks (~8.6 MiB total), under the function return
  limit. Above ~16 MiB the right move would be an `httpAction` streaming a
  `Response` (needs its own token, since a plain `<a href>` carries no Convex
  JWT) — not needed under the 2000-item cap.
- **The cap is enforced before any build**: `assertExportSize` throws at
  2001 items in both writers and in the action, and `menuAdmin.importDraft`
  refuses such a menu before it is ever stored.

**Reversal triggers:** (a) the cap is raised above ~2000 once the public read
is batched (BLOCKED TASK-58 §3) — re-run this bench at the new cap and check
the PDF total against the return limit; (b) the export becomes client-facing
with photos (§5 Q7) — then bytes stop being text and the Memories playbook
(batches + storage, or a streaming HTTP action) applies.

## Opening the files (what "works" means)

The bench proves structure (xref offsets, CRCs, EOCD, cell XML); the task's
browser check opened the downloaded PDF in Chromium and the `.xlsx` in Excel
2016 through COM automation (`Workbooks.Open`, `DisplayAlerts = $false` so a
repair prompt would surface as an error). Serbian Latin (Š Đ č ć ž) renders
in the PDF through non-embedded Helvetica with a `/Differences` encoding;
Cyrillic would render as `?` (BLOCKED TASK-58 §7).
