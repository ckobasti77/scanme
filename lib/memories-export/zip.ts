// TASK-21 — a minimal, runtime-agnostic ZIP writer (RFC-001 §2.10 export).
//
// WHY HAND-ROLLED, and why STORE:
//   • The archive is 400+ already-compressed JPEGs. DEFLATE on a JPEG buys ~0%
//     and costs real CPU per photo, so every entry uses compression method 0
//     (STORE) — compressed size == uncompressed size == the JPEG bytes. STORE
//     is also the single most universally readable method: Windows Explorer,
//     macOS Archive Utility, 7-Zip, and every print-shop tool open it.
//   • No dependency (jszip/archiver are absent and AGENTS.md forbids adding one
//     un-asked). This module is ~150 lines of the format, nothing more.
//
// WHY IT MUST BE SPLIT INTO PIECES (not "zip these buffers"): the export is
// built across scheduler continuations and can never hold the whole archive in
// memory (§ the export job). So the writer exposes the three record types as
// pure byte-builders: each batch emits `localFileRecord`s (header + data) into a
// chunk blob and remembers only the tiny `ZipEntry` bookkeeping; the finalize
// pass turns the surviving entries into the central directory + EOCD. Offsets
// are global byte positions the caller accumulates.
//
// Uint8Array + DataView only — NO Node `Buffer` — so the module loads and runs
// unchanged in the Convex edge runtime (convex-test globs it), the Convex Node
// action, the Next runtime, and the vitest bench. TextEncoder is a global in all
// of them.
//
// Classic ZIP (no ZIP64). The product's per-space photo count is bounded well
// under the 65,535-entry / 4 GiB-offset ceilings; `assertZipClassicLimits`
// makes that assumption loud instead of silently emitting a corrupt archive.

const LOCAL_FILE_HEADER_SIG = 0x04034b50;
const CENTRAL_DIR_HEADER_SIG = 0x02014b50;
const END_OF_CENTRAL_DIR_SIG = 0x06054b50;

// Version 2.0 is all STORE + folders need. Bit 11 of the GP flag marks the file
// name as UTF-8, so a Serbian folder label ("Sto 4", "Ostalo") is decoded
// correctly by any compliant extractor.
const VERSION_NEEDED = 20;
const VERSION_MADE_BY = 20;
const GP_FLAG_UTF8 = 0x0800;
const METHOD_STORE = 0;

const ZIP_MAX_ENTRIES = 0xffff;
const ZIP_MAX_OFFSET = 0xffffffff;

const encoder = new TextEncoder();

// The per-file bookkeeping a batch remembers so the finalize pass can build the
// central directory without re-reading the (large) file data. `offset` is the
// byte position of the file's local header within the whole archive.
export interface ZipEntry {
  name: string;
  crc: number;
  size: number;
  offset: number;
  dosDate: number;
  dosTime: number;
}

// A DOS date/time pair (MS-DOS packed format) from calendar parts. Giving each
// file the moment its photo was taken (Belgrade wall-clock, computed by the
// caller) means Explorer's "Date modified" column sorts the archive the way the
// couple lived the night. Years before 1980 are unrepresentable in DOS format;
// callers only ever pass real (future) celebration dates, but clamp defensively.
export function dosDateTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): { dosDate: number; dosTime: number } {
  const y = Math.max(1980, year);
  const dosDate = ((y - 1980) << 9) | (month << 5) | day;
  const dosTime = (hour << 11) | (minute << 5) | (second >> 1);
  return { dosDate, dosTime };
}

function nameBytes(name: string): Uint8Array {
  return encoder.encode(name);
}

// header + file data, ready to append to a chunk. `data` is the raw STORE bytes
// (the JPEG). Returns the concatenated local record.
export function localFileRecord(
  entry: Omit<ZipEntry, "offset">,
  data: Uint8Array,
): Uint8Array {
  const name = nameBytes(entry.name);
  const header = new Uint8Array(30 + name.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, LOCAL_FILE_HEADER_SIG, true);
  view.setUint16(4, VERSION_NEEDED, true);
  view.setUint16(6, GP_FLAG_UTF8, true);
  view.setUint16(8, METHOD_STORE, true);
  view.setUint16(10, entry.dosTime, true);
  view.setUint16(12, entry.dosDate, true);
  view.setUint32(14, entry.crc >>> 0, true);
  view.setUint32(18, entry.size, true); // compressed == uncompressed (STORE)
  view.setUint32(22, entry.size, true);
  view.setUint16(26, name.length, true);
  view.setUint16(28, 0, true); // extra field length
  header.set(name, 30);

  const record = new Uint8Array(header.length + data.length);
  record.set(header, 0);
  record.set(data, header.length);
  return record;
}

// The byte length of a local record, without materializing it — the caller uses
// this to advance the running global offset as it streams file data into a chunk.
export function localFileRecordSize(name: string, dataSize: number): number {
  return 30 + nameBytes(name).length + dataSize;
}

function centralDirectoryHeader(entry: ZipEntry): Uint8Array {
  const name = nameBytes(entry.name);
  const buf = new Uint8Array(46 + name.length);
  const view = new DataView(buf.buffer);
  view.setUint32(0, CENTRAL_DIR_HEADER_SIG, true);
  view.setUint16(4, VERSION_MADE_BY, true);
  view.setUint16(6, VERSION_NEEDED, true);
  view.setUint16(8, GP_FLAG_UTF8, true);
  view.setUint16(10, METHOD_STORE, true);
  view.setUint16(12, entry.dosTime, true);
  view.setUint16(14, entry.dosDate, true);
  view.setUint32(16, entry.crc >>> 0, true);
  view.setUint32(20, entry.size, true);
  view.setUint32(24, entry.size, true);
  view.setUint16(28, name.length, true);
  view.setUint16(30, 0, true); // extra field length
  view.setUint16(32, 0, true); // file comment length
  view.setUint16(34, 0, true); // disk number start
  view.setUint16(36, 0, true); // internal attributes
  view.setUint32(38, 0, true); // external attributes
  view.setUint32(42, entry.offset, true);
  buf.set(name, 46);
  return buf;
}

export function concatBytes(parts: Uint8Array[]): Uint8Array {
  return concat(parts);
}

function concat(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// Guard the classic-ZIP assumptions (§ header). Thrown, not silent: a corrupt
// archive the couple can't open is worse than a loud failure the host can retry.
export function assertZipClassicLimits(
  entryCount: number,
  archiveBytes: number,
): void {
  if (entryCount > ZIP_MAX_ENTRIES) {
    throw new Error(
      `zip: ${entryCount} entries exceeds classic-ZIP limit ${ZIP_MAX_ENTRIES}`,
    );
  }
  if (archiveBytes > ZIP_MAX_OFFSET) {
    throw new Error(
      `zip: archive ${archiveBytes}B exceeds classic-ZIP 4GiB offset limit`,
    );
  }
}

// The central directory + end-of-central-directory record, built from the final
// surviving entries. `cdOffset` is where the central directory starts in the
// archive (i.e. the total size of every local record already written).
export function centralDirectory(
  entries: ZipEntry[],
  cdOffset: number,
): Uint8Array {
  const headers = entries.map(centralDirectoryHeader);
  const cd = concat(headers);
  assertZipClassicLimits(entries.length, cdOffset + cd.length);

  const eocd = new Uint8Array(22);
  const view = new DataView(eocd.buffer);
  view.setUint32(0, END_OF_CENTRAL_DIR_SIG, true);
  view.setUint16(4, 0, true); // number of this disk
  view.setUint16(6, 0, true); // disk with central directory
  view.setUint16(8, entries.length, true);
  view.setUint16(10, entries.length, true);
  view.setUint32(12, cd.length, true);
  view.setUint32(16, cdOffset, true);
  view.setUint16(20, 0, true); // comment length
  return concat([cd, eocd]);
}

// -----------------------------------------------------------------------------
// CRC-32 (IEEE 802.3 polynomial 0xEDB88320) — the checksum ZIP requires per
// file. Table built once at module load from Uint8Array/Int32Array only (no
// Buffer), so the module stays edge-safe.
// -----------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
