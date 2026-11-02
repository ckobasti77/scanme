import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import {
  MenuAdminRezim,
  RezimDijalogTelo,
  type MenuAdminRezimProps,
  type RezimUsluga,
} from "@/components/admin/menu-admin-rezim";
import { menuAdminSr as dict } from "@/lib/i18n/sr/menu-admin";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";

// K28 — internal admin tool: service mode + import into the new-model draft.
// SSR markup. The Radix dialog portal renders nothing on the server, so the
// dialog body is rendered through its own exported component.

const USLUGA: RezimUsluga = {
  mode: "hospitality",
  modeSetAt: Date.UTC(2026, 9, 12, 8, 30),
  features: {
    callWaiter: true,
    billRequest: false,
    ordering: false,
    roomService: false,
    occupancy: true,
    reservations: "form",
  },
};

const noop = async () => ({ ok: false as const, poruka: "x" });

function render(overrides: Partial<MenuAdminRezimProps> = {}): string {
  return renderToStaticMarkup(
    <MenuAdminRezim
      usluga={USLUGA}
      lokal="Demo restoran"
      onPromeni={noop}
      onProveri={noop}
      onUvezi={noop}
      {...overrides}
    />,
  );
}

function radio(html: string, mode: string): string {
  const match = html.match(new RegExp(`<input[^>]*value="${mode}"[^>]*>`));
  if (!match) throw new Error(`no radio for ${mode}`);
  return match[0];
}

/** Opening tag of the button whose text ends with `label`. */
function buttonTag(html: string, label: string): string {
  const chunk = html.split("<button").find((part) => part.includes(`${label}</button>`));
  if (!chunk) throw new Error(`no button "${label}"`);
  return chunk.slice(0, chunk.indexOf(">"));
}

function isDisabled(html: string, label: string): boolean {
  return buttonTag(html, label).includes('disabled=""');
}

function dialogBody(overrides: { uneto?: string } = {}): string {
  return renderToStaticMarkup(
    <RezimDijalogTelo
      trenutni="hospitality"
      cilj="services"
      features={USLUGA.features}
      lokal="Demo restoran"
      uneto={overrides.uneto ?? ""}
      onUneto={() => undefined}
      poruka={null}
      onPotvrdi={() => undefined}
      onOdustani={() => undefined}
    />,
  );
}

describe("MenuAdminRezim — Režim usluge", () => {
  test("shows the current mode and when it was set (Belgrade time)", () => {
    const html = render();
    expect(html).toContain(dict.rezimNaslov);
    expect(html).toContain(menuDomenSr.modes.hospitality);
    expect(html).toContain("12. okt 2026");
    expect(html).toContain("10:30");
  });

  test("unavailable modes are visible, disabled and labelled", () => {
    const html = render();
    expect(radio(html, "hospitality")).not.toContain("disabled");
    expect(radio(html, "services")).toContain("disabled");
    expect(radio(html, "retail")).toContain("disabled");
    expect(html).toContain(dict.rezimNedostupno.services);
    expect(html).toContain("V1.1");
    expect(html).toContain(dict.rezimNedostupno.retail);
    expect(html).toContain("Kasnija faza");
    expect(radio(html, "services")).toMatch(/aria-describedby="[^"]*razlog-services"/);
  });

  test("the change button is disabled while the current mode is selected", () => {
    const html = render();
    expect(isDisabled(html, dict.rezimPromeni)).toBe(true);
  });

  test("usluga null shows only the no-service note", () => {
    const html = render({ usluga: null });
    expect(html).toContain(dict.rezimNemaUsluge);
    expect(html).not.toContain(dict.rezimTrenutni);
    expect(html).not.toContain('type="radio"');
  });

  test("pocetniModal rezim preselects another mode (dialog itself is portal-only)", () => {
    const html = render({ pocetniModal: "rezim" });
    expect(radio(html, "services")).toContain("checked");
    expect(radio(html, "hospitality")).not.toContain("checked");
  });
});

describe("RezimDijalogTelo — confirm dialog body", () => {
  test("shows the notice and the features hospitality → services switches off", () => {
    const html = dialogBody();
    expect(html).toContain(menuDomenSr.modeChangeNotice);
    expect(html).toContain(dict.rezimGase);
    expect(html).toContain(dict.rezimFunkcije.callWaiter);
    expect(html).toContain("Poziv konobara");
    expect(html).toContain(dict.rezimFunkcije.occupancy);
    // callWaiter and occupancy are on, billRequest is off: markers only on the first two.
    expect(html.split(dict.rezimUkljucena).length - 1).toBe(2);
    // reservations stay supported by services → not in the list.
    expect(html).not.toContain(dict.rezimFunkcije.reservations);
    expect(html).not.toContain(dict.rezimNistaSeNeGasi);
  });

  test("K28 review: a sharp warning first, then the notice; every dropped feature has a chip", () => {
    const html = dialogBody();
    expect(html).toContain(dict.rezimUpozorenje);
    expect(html).toContain(menuDomenSr.modeChangeNotice);
    expect(html.indexOf(dict.rezimUpozorenje)).toBeLessThan(html.indexOf(menuDomenSr.modeChangeNotice));
    expect(html).toContain("--admin-warning-soft");
    // billRequest, ordering and roomService are off in USLUGA and dropped by services: each gets the neutral "already off" chip.
    expect(html.split(dict.rezimVecIskljucena).length - 1).toBe(3);
    const li = html.split("<li").filter((part) => part.includes(dict.rezimFunkcije.billRequest));
    expect(li).toHaveLength(1);
    expect(li[0]).toContain(dict.rezimVecIskljucena);
  });

  test("K28 review: the selected current mode explains the disabled change button", () => {
    const html = render();
    expect(html).toContain(dict.rezimIzaberiDrugi);
    expect(buttonTag(html, dict.rezimPromeni)).toMatch(/aria-describedby="[^"]*-isti"/);
    expect(render({ pocetniModal: "rezim" })).not.toContain(dict.rezimIzaberiDrugi);
  });

  test("lists nothing to switch off when the target keeps every feature", () => {
    const html = renderToStaticMarkup(
      <RezimDijalogTelo
        trenutni="services"
        cilj="hospitality"
        features={USLUGA.features}
        lokal="Demo restoran"
        uneto=""
        onUneto={() => undefined}
        poruka={null}
        onPotvrdi={() => undefined}
        onOdustani={() => undefined}
      />,
    );
    expect(html).toContain(dict.rezimNistaSeNeGasi);
  });

  test("labels the name input with the venue and keeps confirm disabled until it matches", () => {
    const empty = dialogBody();
    expect(empty).toContain("Za potvrdu upiši naziv lokala: Demo restoran");
    expect(empty).toContain(dict.rezimPotvrdaPomoc);
    expect(isDisabled(empty, dict.rezimPotvrdi)).toBe(true);
    expect(isDisabled(dialogBody({ uneto: "demo restoran" }), dict.rezimPotvrdi)).toBe(true);
    expect(isDisabled(dialogBody({ uneto: "  Demo restoran " }), dict.rezimPotvrdi)).toBe(false);
  });
});

describe("MenuAdminRezim — Uvoz u nacrt", () => {
  test("renders the labels and both actions, import locked before a check", () => {
    const html = render();
    expect(html).toContain(dict.uvozNaslov);
    expect(html).toContain(dict.uvozPolje);
    expect(html).toContain(dict.uvozPomoc);
    expect(html).toContain(dict.uvozProveri);
    expect(isDisabled(html, dict.uvozUvezi)).toBe(true);
  });

  test("a clean prefilled check shows the report and unlocks the import", () => {
    const html = render({
      pocetniModal: "uvoz",
      pocetniTekst: "{}",
      pocetniProvera: {
        ok: true,
        imported: false,
        grupe: 3,
        artikli: 24,
        upozorenja: 1,
        duplikati: 0,
        blokade: [],
      },
    });
    expect(html).toContain("Grupa: 3 · artikala: 24");
    expect(html).toContain("Upozorenja: 1 · duplikata: 0");
    expect(html).toContain(dict.uvozSpremno);
    expect(html).not.toContain(dict.uvozBlokirano);
    expect(isDisabled(html, dict.uvozUvezi)).toBe(false);
  });

  test("blockers are listed with their text and keep the import locked", () => {
    const html = render({
      pocetniTekst: "{}",
      pocetniProvera: {
        ok: true,
        imported: false,
        grupe: 1,
        artikli: 2,
        upozorenja: 0,
        duplikati: 0,
        blokade: ["import_target_not_empty", "unknown_code"],
      },
    });
    expect(html).toContain(dict.uvozBlokirano);
    expect(html).toContain(menuDomenSr.migrationIssues.import_target_not_empty);
    expect(html).toContain("unknown_code");
    expect(html).not.toContain(dict.uvozSpremno);
    expect(isDisabled(html, dict.uvozUvezi)).toBe(true);
  });
});

describe("wording", () => {
  test("the internal tool does not use client-panel wording", () => {
    const html = render() + dialogBody();
    // K28 review (intentional): the word boundaries are now Unicode-aware. The ASCII \b treated "š" as a
    // non-word character, so "više" (in the new rezimUpozorenje) matched as the word "vi". Same words are banned.
    expect(html).not.toMatch(/(?<!\p{L})vaš\p{L}*|(?<!\p{L})vi(?!\p{L})|molimo|obratite se/iu);
  });
});
