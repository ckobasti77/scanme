import { describe, expect, test } from "vitest";
import {
  centralDirectory,
  crc32,
  dosDateTime,
  localFileRecord,
  localFileRecordSize,
  type ZipEntry,
} from "./zip";

const enc = new TextEncoder();

describe("crc32", () => {
  test("matches the standard check value for '123456789'", () => {
    // The canonical CRC-32/ISO-HDLC check value.
    expect(crc32(enc.encode("123456789"))).toBe(0xcbf43926);
  });

  test("empty input is 0", () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe("zip writer round-trips its own bytes", () => {
  // Build a two-file, two-folder archive exactly the way the export does:
  // stream local records into one buffer, remembering ZipEntry bookkeeping, then
  // append the central directory. Then parse it all back and assert every offset,
  // size, name, and CRC an extractor would read.
  function buildArchive(files: { name: string; data: Uint8Array }[]) {
    const { dosDate, dosTime } = dosDateTime(2026, 8, 27, 21, 49, 10);
    const records: Uint8Array[] = [];
    const entries: ZipEntry[] = [];
    let offset = 0;
    for (const f of files) {
      const crc = crc32(f.data);
      const entry: ZipEntry = {
        name: f.name,
        crc,
        size: f.data.length,
        offset,
        dosDate,
        dosTime,
      };
      records.push(localFileRecord(entry, f.data));
      entries.push(entry);
      offset += localFileRecordSize(f.name, f.data.length);
    }
    const cd = centralDirectory(entries, offset);
    const total = offset + cd.length;
    const archive = new Uint8Array(total);
    let at = 0;
    for (const r of records) {
      archive.set(r, at);
      at += r.length;
    }
    archive.set(cd, at);
    return { archive, entries, cdOffset: offset };
  }

  const files = [
    { name: "Sto 4/2026-08-27_2149_sto-04_01.jpg", data: enc.encode("first") },
    { name: "Ostalo/2026-08-27_2150_ostalo_01.jpg", data: enc.encode("second-longer") },
  ];

  test("EOCD reports the right count and central-directory offset", () => {
    const { archive, cdOffset } = buildArchive(files);
    const view = new DataView(archive.buffer);
    const eocdAt = archive.length - 22;
    expect(view.getUint32(eocdAt, true)).toBe(0x06054b50);
    expect(view.getUint16(eocdAt + 8, true)).toBe(2); // entries on disk
    expect(view.getUint16(eocdAt + 10, true)).toBe(2); // total entries
    expect(view.getUint32(eocdAt + 16, true)).toBe(cdOffset); // cd offset
  });

  test("each local header sits at its recorded offset with the right name+crc", () => {
    const { archive, entries } = buildArchive(files);
    const dec = new TextDecoder();
    for (let i = 0; i < entries.length; i += 1) {
      const e = entries[i];
      const view = new DataView(archive.buffer, e.offset);
      expect(view.getUint32(0, true)).toBe(0x04034b50); // local sig
      expect(view.getUint32(14, true)).toBe(e.crc); // crc
      expect(view.getUint32(18, true)).toBe(e.size); // compressed
      expect(view.getUint32(22, true)).toBe(e.size); // uncompressed
      const nameLen = view.getUint16(26, true);
      const name = dec.decode(
        archive.subarray(e.offset + 30, e.offset + 30 + nameLen),
      );
      expect(name).toBe(e.name);
      // The file data immediately follows the name.
      const data = archive.subarray(
        e.offset + 30 + nameLen,
        e.offset + 30 + nameLen + e.size,
      );
      expect(crc32(data)).toBe(e.crc);
    }
  });

  test("filenames are flagged UTF-8 (GP bit 11)", () => {
    const { archive } = buildArchive(files);
    const view = new DataView(archive.buffer);
    expect(view.getUint16(6, true) & 0x0800).toBe(0x0800);
  });
});
