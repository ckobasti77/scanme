// ScanMe Menu V1 - K34 review fix N5 (second half): the ingest route
// (app/api/meni/analitika/route.ts) drops a body that DECLARES itself over
// MAX_TELO_BAJTOVA without reading it, and answers like it does for an invalid
// batch (204, nothing sent to Convex). A body without a Content-Length is read
// as before and the size of the text decides. Tags [N5], [ruta].

import { beforeEach, describe, expect, test, vi } from "vitest";
import { MAX_TELO_BAJTOVA, teloPrevelikoPoZaglavlju } from "./ulaz";

const fetchMutation = vi.hoisted(() =>
  vi.fn<(reference: unknown, args: unknown) => Promise<{ ok: boolean; primljeno: number }>>(async () => ({
    ok: true,
    primljeno: 1,
  })),
);
vi.mock("convex/nextjs", () => ({ fetchMutation }));
vi.mock("@convex-dev/auth/nextjs/server", () => ({ convexAuthNextjsToken: vi.fn(async () => undefined) }));

const { POST } = await import("@/app/api/meni/analitika/route");

const TELEFON =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const URL_RUTE = "https://scanme.test/api/meni/analitika";
const validno = { slug: "cafe-bar", dogadjaji: [{ vrsta: "stranica", stranica: "pg_5k2m9q0x7c1d", jezik: "sr" }] };

function zahtev(telo: string, zaglavlja: Record<string, string> = {}) {
  return new Request(URL_RUTE, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": TELEFON, ...zaglavlja },
    body: telo,
  });
}

beforeEach(() => {
  fetchMutation.mockClear();
});

describe("teloPrevelikoPoZaglavlju", () => {
  test("[N5] only a Content-Length above the limit is over; the limit itself is fine", () => {
    expect(teloPrevelikoPoZaglavlju(String(MAX_TELO_BAJTOVA + 1))).toBe(true);
    expect(teloPrevelikoPoZaglavlju(String(MAX_TELO_BAJTOVA))).toBe(false);
    expect(teloPrevelikoPoZaglavlju("0")).toBe(false);
    expect(teloPrevelikoPoZaglavlju("120")).toBe(false);
    expect(teloPrevelikoPoZaglavlju(` ${MAX_TELO_BAJTOVA + 1} `)).toBe(true);
    expect(teloPrevelikoPoZaglavlju("99999999999999999999")).toBe(true);
  });

  test("[N5] a missing or malformed header means unknown: the body is read as before", () => {
    for (const vrednost of [null, "", "  ", "abc", "-5", "1e9", "12.5", "0x20000", "9000 bytes"]) {
      expect(teloPrevelikoPoZaglavlju(vrednost), JSON.stringify(vrednost)).toBe(false);
    }
  });
});

describe("POST /api/meni/analitika: the size of the body", () => {
  test("[ruta] a valid call is sent to Convex and answered 204", async () => {
    const odgovor = await POST(zahtev(JSON.stringify(validno)));
    expect(odgovor.status).toBe(204);
    expect(fetchMutation).toHaveBeenCalledTimes(1);
    expect(fetchMutation.mock.calls[0][1]).toMatchObject({ slug: "cafe-bar", uredjaj: "telefon" });
  });

  test("[N5] a body that declares itself over the limit is not read: 204, nothing sent to Convex", async () => {
    const request = zahtev(JSON.stringify(validno), { "content-length": String(MAX_TELO_BAJTOVA + 1) });
    // The header must have survived the Request, or this test would prove nothing.
    expect(request.headers.get("content-length")).toBe(String(MAX_TELO_BAJTOVA + 1));
    const procitano = vi.spyOn(request, "text");

    const odgovor = await POST(request);

    expect(odgovor.status).toBe(204);
    expect(procitano).not.toHaveBeenCalled();
    expect(fetchMutation).not.toHaveBeenCalled();
  });

  test("[N5] a body at the limit is still read (the header alone does not refuse it)", async () => {
    const request = zahtev(JSON.stringify(validno), { "content-length": String(MAX_TELO_BAJTOVA) });
    const procitano = vi.spyOn(request, "text");

    const odgovor = await POST(request);

    expect(odgovor.status).toBe(204);
    expect(procitano).toHaveBeenCalledTimes(1);
    expect(fetchMutation).toHaveBeenCalledTimes(1);
  });

  test("[ruta] without a Content-Length the body is read, and a text over the limit is still dropped (as before)", async () => {
    const preveliko = JSON.stringify({ ...validno, dopuna: "x".repeat(MAX_TELO_BAJTOVA) });
    const request = zahtev(preveliko);
    expect(request.headers.get("content-length")).toBeNull();
    const procitano = vi.spyOn(request, "text");

    const odgovor = await POST(request);

    expect(odgovor.status).toBe(204);
    expect(procitano).toHaveBeenCalledTimes(1);
    expect(fetchMutation).not.toHaveBeenCalled();
  });
});
