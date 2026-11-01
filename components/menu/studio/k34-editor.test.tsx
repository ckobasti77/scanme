// K34 render tests: the review fixes of the editor's dialogs and fields. Server markup only
// (renderToStaticMarkup, no DOM), set up like k33.test.tsx: effects never run and
// `@/components/ui/dialog` is replaced by a stand-in that renders an open dialog inline.
//
// What a static render cannot show, and a browser check must: a dialog that was mounted BEFORE the
// page content arrived and then gets it (that needs a client render that keeps state; the rule behind
// it is covered in lib/menu/studio/k34-editor.test.ts), the section deletion dialog staying open with
// its text after a refusal (state set after an await), and where the focus goes when a save starts
// (Tab from an edited name to the price field). Here the markup of the settled states is checked.

import type { ComponentProps, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { fixtureMenu } from "@/components/menu/fixtures";
import { sadrzajIzSnapshota } from "@/lib/menu/studio/iz-snapshota";
import { Dugme } from "../zajednicko/dugme";
import { OpcijaRed } from "./artikal/grupa-dodataka";
import { VarijantaRed } from "./artikal/varijante-i-dodaci";
import { NoviKombo } from "./kombo/novi-kombo";
import { DodajIzPonude } from "./room-service/dodaj-iz-ponude";
import { TabelarniUnos } from "./tabelarni-unos/tabelarni-unos";

// `Dialog` shows its content inline when open (the Radix portal mounts only after effects).
vi.mock("@/components/ui/dialog", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/components/ui/dialog")>();
  return {
    ...original,
    Dialog: ({ open, children }: { open?: boolean; children?: ReactNode }) => (open ? <>{children}</> : null),
    DialogContent: ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => (
      <div role="dialog" data-povrsina={props["data-povrsina"] as string | undefined}>
        {children}
      </div>
    ),
    DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
    DialogDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  };
});

// -----------------------------------------------------------------------------
// Helpers (markup is read back with small regexes, as in k33)
// -----------------------------------------------------------------------------

const unesc = (text: string) =>
  text
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");

function attr(tag: string, name: string): string | undefined {
  const value = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
  return value === undefined ? undefined : unesc(value);
}

/** An attribute of the tag, not a Tailwind variant such as `disabled:` or `aria-disabled:` in the class list. */
const imaAtribut = (tag: string, name: string) => new RegExp(`\\s${name}(=|\\s|>|/)`).test(tag);

const nista = () => undefined;
const nikad = nista as never;

const selekti = (html: string) => [...html.matchAll(/<select\b[^>]*>[\s\S]*?<\/select>/g)].map((match) => match[0]);
/** The values of the options a select stands on (`selected=""`): exactly one for a single select. */
const izabraneOpcije = (select: string) =>
  [...select.matchAll(/<option\b([^>]*)>/g)].filter((match) => imaAtribut(match[1], "selected")).map((match) => attr(match[1], "value"));
const polja = (html: string) => [...html.matchAll(/<input\b[^>]*>/g)].map((match) => match[0]);
const dugmad = (html: string) => [...html.matchAll(/<button\b[^>]*>/g)].map((match) => match[0]);

const meni = fixtureMenu("srednji");
const glavna = meni.snapshot.pages.find((page) => page.isDefault);
const sadrzaj = sadrzajIzSnapshota(meni.snapshot, glavna?.key ?? "");
if (!sadrzaj) throw new Error("the fixture has no main page");
const sekcije = sadrzaj.sekcije;
// The default is deliberately NOT the first section: a select that ignored it would show the first.
const druga = sekcije[1];
if (!druga) throw new Error("the fixture page needs at least two sections");

// -----------------------------------------------------------------------------
// 1: the section / category the dialogs stand on
// -----------------------------------------------------------------------------

describe("K34: the section a quick-entry row goes to", () => {
  const tabela = (podrazumevana: string | null) =>
    renderToStaticMarkup(
      <TabelarniUnos
        otvoreno
        onOtvoreno={nista}
        sekcije={sekcije.map(({ id, naziv }) => ({ id, naziv }))}
        podrazumevanaSekcija={podrazumevana}
        onPosalji={nikad}
        onDodato={nista}
      />,
    );

  test("every row's select stands on the default section from the props", () => {
    const sviSelekti = selekti(tabela(druga.id));
    expect(sviSelekti.length).toBeGreaterThan(0);
    for (const select of sviSelekti) {
      expect([...select.matchAll(/<option\b/g)]).toHaveLength(sekcije.length);
      expect(izabraneOpcije(select)).toEqual([druga.id]);
    }
  });

  test("without a default from the props, every row stands on the first section", () => {
    for (const select of selekti(tabela(null))) expect(izabraneOpcije(select)).toEqual([sekcije[0].id]);
  });
});

describe("K34: the section of a new combo", () => {
  const kombo = (podrazumevana: string | null) =>
    renderToStaticMarkup(
      <NoviKombo otvoreno onOtvoreno={nista} sekcije={sekcije} podrazumevanaSekcija={podrazumevana} onDodaj={nikad} />,
    );

  test("the select stands on the default section from the props", () => {
    const sviSelekti = selekti(kombo(druga.id));
    expect(sviSelekti).toHaveLength(1);
    expect(izabraneOpcije(sviSelekti[0])).toEqual([druga.id]);
  });

  test("without a default from the props, on the first section", () => {
    const sviSelekti = selekti(kombo(null));
    expect(sviSelekti).toHaveLength(1);
    expect(izabraneOpcije(sviSelekti[0])).toEqual([sekcije[0].id]);
  });
});

describe("K34: the Room service category of Dodaj iz postojeće ponude", () => {
  const kategorije = sekcije.map(({ id, naziv }) => ({ id, naziv }));
  const dijalog = (pocetna: string | null) =>
    renderToStaticMarkup(
      <DodajIzPonude
        otvoreno
        onOtvoreno={nista}
        kategorije={kategorije}
        pocetnaKategorija={pocetna}
        uRs={new Set<string>()}
        traziArtikle={nikad}
        onDodaj={nikad}
        najavi={nista}
      />,
    );

  test("the select stands on the category it was opened from", () => {
    const sviSelekti = selekti(dijalog(druga.id));
    expect(sviSelekti).toHaveLength(1);
    expect(izabraneOpcije(sviSelekti[0])).toEqual([druga.id]);
  });

  test("opened from the header (no category), on the first one", () => {
    const sviSelekti = selekti(dijalog(null));
    expect(sviSelekti).toHaveLength(1);
    expect(izabraneOpcije(sviSelekti[0])).toEqual([kategorije[0].id]);
  });
});

// -----------------------------------------------------------------------------
// 4: the fields of a variant and of an add-on stay focusable while a save runs
// -----------------------------------------------------------------------------

describe("K34: variant and add-on fields while a save is running", () => {
  const varijanta = { id: "v1", key: "v1", naziv: "Velika", cena: 450 };
  const opcija = { id: "o1", key: "o1", naziv: "Dodatni kajmak", doplata: 120 };

  const redVarijante = (izmene: Partial<ComponentProps<typeof VarijantaRed>> = {}) =>
    renderToStaticMarkup(
      <ul>
        <VarijantaRed
          varijanta={varijanta}
          redniBroj={1}
          onemoguceno={false}
          radi={false}
          onSacuvaj={nikad}
          onUkloni={nista}
          onGreska={nista}
          {...izmene}
        />
      </ul>,
    );
  const redOpcije = (izmene: Partial<ComponentProps<typeof OpcijaRed>> = {}) =>
    renderToStaticMarkup(
      <ul>
        <OpcijaRed opcija={opcija} redniBroj={1} radi={false} onSacuvaj={nikad} onUkloni={nista} {...izmene} />
      </ul>,
    );

  const redovi = {
    varijanta: redVarijante,
    opcija: redOpcije,
  } as const;

  for (const [ime, render] of Object.entries(redovi)) {
    test(`${ime}: idle, nothing is disabled and nothing is marked`, () => {
      const html = render();
      expect(polja(html)).toHaveLength(2);
      expect(dugmad(html)).toHaveLength(1);
      for (const tag of [...polja(html), ...dugmad(html)]) {
        expect(imaAtribut(tag, "disabled"), tag).toBe(false);
        expect(imaAtribut(tag, "aria-disabled"), tag).toBe(false);
        expect(imaAtribut(tag, "readonly"), tag).toBe(false);
      }
    });

    test(`${ime}: a save is running, the fields are not disabled (the focus stays) and the remove button ignores clicks instead`, () => {
      const html = render({ radi: true });
      for (const tag of polja(html)) {
        expect(imaAtribut(tag, "disabled"), tag).toBe(false);
        expect(imaAtribut(tag, "readonly"), tag).toBe(false);
      }
      const [ukloni] = dugmad(html);
      expect(imaAtribut(ukloni, "disabled")).toBe(false);
      expect(attr(ukloni, "aria-disabled")).toBe("true");
    });
  }

  test("variant: a role that may not edit still gets disabled fields and a disabled button", () => {
    const html = redVarijante({ onemoguceno: true });
    for (const tag of [...polja(html), ...dugmad(html)]) expect(imaAtribut(tag, "disabled"), tag).toBe(true);
    // And while a save runs in the same state, the permission still holds.
    const radi = redVarijante({ onemoguceno: true, radi: true });
    for (const tag of [...polja(radi), ...dugmad(radi)]) expect(imaAtribut(tag, "disabled"), tag).toBe(true);
  });

  test("variant: an editing role is not disabled by a running save", () => {
    const html = redVarijante({ onemoguceno: false, radi: true });
    expect(polja(html).some((tag) => imaAtribut(tag, "disabled"))).toBe(false);
    expect(dugmad(html).some((tag) => imaAtribut(tag, "disabled"))).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// 5: Dugme asChild keeps its onClick
// -----------------------------------------------------------------------------

describe("K34: Dugme asChild passes onClick on to the child element", () => {
  // A server render leaves handlers out of the markup and never clicks, so this child runs the click
  // handler that Slot gives it while it renders: that shows what reached it, and in which order.
  const Dete = ({ onClick, ...rest }: ComponentProps<"a">) => {
    onClick?.({} as never);
    return <a {...rest} />;
  };

  test("the handler reaches the child", () => {
    const klik = vi.fn();
    const html = renderToStaticMarkup(
      <Dugme asChild onClick={klik}>
        <Dete href="#x">Idi</Dete>
      </Dugme>,
    );
    expect(klik).toHaveBeenCalledTimes(1);
    expect(html).toContain('href="#x"');
    expect(html).not.toContain("<button");
  });

  test("the child's own handler runs first, then the one of Dugme", () => {
    const redosled: string[] = [];
    renderToStaticMarkup(
      <Dugme asChild onClick={() => redosled.push("dugme")}>
        <Dete href="#x" onClick={() => redosled.push("dete")}>
          Idi
        </Dete>
      </Dugme>,
    );
    expect(redosled).toEqual(["dete", "dugme"]);
  });

  test("without an onClick on Dugme the child's own handler is left as it is", () => {
    const svoj = vi.fn();
    renderToStaticMarkup(
      <Dugme asChild>
        <Dete href="#x" onClick={svoj}>
          Idi
        </Dete>
      </Dugme>,
    );
    expect(svoj).toHaveBeenCalledTimes(1);
  });
});
