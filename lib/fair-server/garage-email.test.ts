import { ConvexError } from "convex/values";
import { describe, expect, test, vi } from "vitest";
import type { FairPublicModel } from "@/lib/fair-contract";
import { renderFairGarageEmail } from "@/lib/fair-garage-email";
import { fairGarageSr } from "@/lib/i18n/sr/fair-garage";

vi.mock("server-only", () => ({}));
const { fairGarageEmailHash, handleFairGarageEmail } = await import("./garage-email");
const { fairShareCode, fairShareCodeHash } = await import("./sharing");
const { fairVisitorHash } = await import("./visitor");

const NOW = Date.parse("2026-11-01T12:00:00+01:00");
const SECRET = "test-fair-visitor-secret-0123456789abcdef";
const GATEWAY_SECRET = "test-fair-gateway-secret-0123456789abcdef";
const ENV = { secret: SECRET, gatewaySecret: GATEWAY_SECRET, nodeEnv: "production" };
const EMAIL = "garaza.test@example.invalid";

const items = (...pairs: [string, string][]) => [{ id: "g1", label: "Pogon", order: 1, items: pairs.map(([label, value], order) => ({ id: `s${order}`, label, value, order, isHighlight: true })) }];

function model(id: string, overrides: Partial<FairPublicModel> = {}): FairPublicModel {
  return {
    id, eventId: "event-amf", eventSlug: "auto-moto-fest-2026", eventTitle: "TEST AMF", participationId: "p", exhibitorName: "TEST izlagač",
    brandId: "b", brandName: "Ford", standId: "s", standMapLocationId: "m", slug: id, displayName: `Ford ${id}`,
    priceText: "od 27.490 €", specificationGroups: items(["Snaga", "137 kW / 186 KS"], ["Motor", "1,5 EcoBoost"], ["Menjač", "Automatski, 8 brzina"]),
    photoUrl: `https://scanme.rs/fair/auto-moto-fest-2026/${id}.webp`,
    capabilities: {} as FairPublicModel["capabilities"],
    ...overrides,
  };
}

const KODIAQ = model("skoda-kodiaq", { brandName: "Škoda", displayName: "Škoda Kodiaq", priceText: "50.340 €", priceSecondaryText: "Osnovni model od 39.900 €", specificationGroups: items(["Snaga", "142 kW / 193 KS"], ["Motor", "2,0 TDI"], ["Menjač", "Automatski DSG"]) });
const GRENADIER = model("ineos-grenadier", { brandName: "Ineos", displayName: "Ineos Grenadier", priceText: "Cena na upit" });
const KUGA = model("ford-kuga", { displayName: "Ford Kuga" });

function post(body: unknown) {
  return new Request("https://scanme.rs/api/fair/garage-email", {
    method: "POST",
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
    body: JSON.stringify(body),
  });
}
const valid = { email: EMAIL, consent: true, eventSlug: "auto-moto-fest-2026", eventModelIds: ["skoda-kodiaq", "ford-kuga"], submissionId: "test-garage-submission-1" };

function backend(found: FairPublicModel[] = [KODIAQ, KUGA]) {
  return {
    getModelsByIds: vi.fn(async () => found),
    requestGarageEmail: vi.fn(async (args: { eventModelIds: string[] }) => ({ modelCount: args.eventModelIds.length, duplicate: false })),
  };
}

describe("garage email gateway", () => {
  test("bad email and missing consent never reach Convex", async () => {
    const fake = backend();
    const bad = await handleFairGarageEmail(post({ ...valid, email: "nije-email" }), { now: NOW, env: ENV, backend: fake });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ ok: false, code: "INVALID_INPUT", details: { field: "email" } });
    const noConsent = await handleFairGarageEmail(post({ ...valid, consent: false }), { now: NOW, env: ENV, backend: fake });
    expect(noConsent.status).toBe(400);
    expect(await noConsent.json()).toMatchObject({ details: { field: "consent" } });
    const extra = await handleFairGarageEmail(post({ ...valid, visitorHash: "x" }), { now: NOW, env: ENV, backend: fake });
    expect(extra.status).toBe(400);
    expect(fake.getModelsByIds).not.toHaveBeenCalled();
    expect(fake.requestGarageEmail).not.toHaveBeenCalled();
  });

  test("sends only published models of the event, with the hashed address and the vrati link", async () => {
    const foreign = model("foreign", { eventId: "event-other", eventSlug: "elektromobilnost-2026" });
    // getModelsByIds returns published models only: "draft" is simply missing.
    const fake = backend([KODIAQ, foreign, KUGA]);
    const response = await handleFairGarageEmail(post({ ...valid, email: " Garaza.Test@Example.invalid ", eventModelIds: ["skoda-kodiaq", "draft", "foreign", "ford-kuga", "ford-kuga"] }), { now: NOW, env: ENV, backend: fake });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ ok: true, value: { modelCount: 2, duplicate: false } });
    expect(JSON.stringify(body)).not.toContain(EMAIL);
    const args = fake.requestGarageEmail.mock.calls[0][0] as unknown as Record<string, string & string[]>;
    expect(args.eventModelIds).toEqual(["skoda-kodiaq", "ford-kuga"]);
    expect(args.eventId).toBe("event-amf");
    expect(args.email).toBe(EMAIL);
    expect(args.emailHash).toBe(fairGarageEmailHash(EMAIL, SECRET));
    const token = response.headers.get("set-cookie")!.split(";")[0].split("=")[1];
    const code = fairShareCode(fairVisitorHash(token, SECRET), "test-garage-submission-1");
    expect(args.codeHash).toBe(fairShareCodeHash(code));
    expect(args.html).toContain(`https://scanme.rs/sajam/auto-moto-fest-2026/garaza?vrati=${code}`);
    expect(args.html).not.toContain("foreign");
  });

  test("over the limit answers 429", async () => {
    const fake = backend();
    fake.requestGarageEmail.mockRejectedValueOnce(new ConvexError({ code: "RATE_LIMITED", details: { retryAfterMs: 60_000 } }));
    const response = await handleFairGarageEmail(post(valid), { now: NOW, env: ENV, backend: fake });
    expect(response.status).toBe(429);
  });
});

describe("garage email message", () => {
  const email = renderFairGarageEmail({
    models: [KODIAQ, GRENADIER, KUGA],
    baseUrl: "https://scanme.rs",
    garageUrl: "https://scanme.rs/sajam/auto-moto-fest-2026/garaza?vrati=TESTcodeTESTcodeTESTcode",
    publicEventSlug: "auto-moto-fest-2026",
    dict: fairGarageSr,
  });

  test("lists every model with the model page price text and the garage link", () => {
    expect(email.subject).toBe("Vaša garaža sa sajma Auto Moto Fest 2026");
    for (const html of [email.html, email.text]) {
      expect(html).toContain("Sačuvali ste 3 modela. Evo ih na jednom mestu.");
      expect(html).toContain("50.340 €");
      expect(html).toContain("Osnovni model od 39.900 €");
      expect(html).toContain("Cena na upit");
      expect(html).toContain("od 27.490 €");
      expect(html).toContain("142 kW · 2.0 TDI · Automatski");
      expect(html).toContain("https://scanme.rs/sajam/auto-moto-fest-2026/garaza?vrati=TESTcodeTESTcodeTESTcode");
      for (const slug of ["skoda-kodiaq", "ineos-grenadier", "ford-kuga"]) expect(html).toContain(`https://scanme.rs/sajam/auto-moto-fest-2026/model/${slug}`);
    }
    expect(email.html).toContain(`alt="Škoda Kodiaq"`);
    expect(email.html).toContain("Otvori moju garažu");
    expect(email.html).not.toMatch(/width="1"|height="1"/);
  });

  test("Serbian plurals", () => {
    const one = renderFairGarageEmail({ models: [KUGA], baseUrl: "https://scanme.rs", garageUrl: "https://scanme.rs/x", publicEventSlug: "auto-moto-fest-2026", dict: fairGarageSr });
    expect(one.text).toContain("Sačuvali ste 1 model. Evo ga na jednom mestu.");
  });
});
