// ScanMe Menu V1 (K18) — what the screenshot critique of the publish flow
// changed, as server markup (renderToStaticMarkup, no DOM): the article
// reached from Objavi says what blocks and when it is fixed; the safety
// sentence lives in the dialog's footer; colleagues in the editor are named
// while publishing; a detail field in conflict shows both values; the header
// says a conflict waits for a choice and leads to it.

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { IZLOG_SADA } from "@/components/menu/fixtures";
import { fmt } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import type { AutosaveZbir } from "@/lib/menu/studio/autosave-queue";
import { opisKonflikta } from "@/lib/menu/studio/conflict";
import type { StudioPregledObjave } from "@/lib/menu/studio/model";
import { ProblemObjaveTraka } from "./artikal/problem-objave";
import { KonfliktPolja } from "./konflikt/konflikt-polja";
import { ObjavaModal } from "./objava/objava-modal";
import { StudioZaglavlje } from "./shell/zaglavlje";

vi.mock("@/components/ui/dialog", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/components/ui/dialog")>();
  return {
    ...original,
    Dialog: ({ open, children }: { open?: boolean; children?: ReactNode }) => (open ? <>{children}</> : null),
    DialogContent: ({ children }: { children?: ReactNode }) => <div role="dialog">{children}</div>,
    DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
    DialogDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  };
});

const o = menuStudioSr.objavljivanje;
const p = o.problemObjave;
const unesc = (text: string) =>
  text.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const tekst = (markup: string) => unesc(markup.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const dugmad = (markup: string) => [...markup.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((match) => tekst(match[1]));
const nista = () => undefined;

const STANJE = { naziv: "Čorba od graška", cena: null, varijanteUkljucene: false, ceneVarijanti: [], prikaza: 1 };

describe("the strip of an article reached from Objavi", () => {
  test("an open error says what blocks and what to do, as an alert, without a button yet", () => {
    const html = renderToStaticMarkup(
      <ProblemObjaveTraka problem={{ kodovi: ["price_missing"], greska: true }} stanje={STANJE} onObjavi={nista} />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('data-problem-objave="greska"');
    expect(tekst(html)).toBe(`${p.greska} ${menuDomenSr.publishIssues.price_missing} ${p.saveti.price_missing}`);
    expect(dugmad(html)).toEqual([]);
  });

  test("once fixed (a price, or a priced variant) it says so and offers Objavi again", () => {
    for (const stanje of [
      { ...STANJE, cena: 320 },
      { ...STANJE, varijanteUkljucene: true, ceneVarijanti: [null, 340] },
    ]) {
      const html = renderToStaticMarkup(
        <ProblemObjaveTraka problem={{ kodovi: ["price_missing"], greska: true }} stanje={stanje} onObjavi={nista} />,
      );
      expect(html).toContain('role="status"');
      expect(html).toContain('data-problem-objave="reseno"');
      expect(tekst(html)).toContain(p.reseno);
      expect(dugmad(html)).toEqual([p.ponovoObjavi]);
    }
  });

  test("a variant switched on without a price does not count as a price", () => {
    const html = renderToStaticMarkup(
      <ProblemObjaveTraka
        problem={{ kodovi: ["price_missing"], greska: true }}
        stanje={{ ...STANJE, varijanteUkljucene: true, ceneVarijanti: [null] }}
        onObjavi={nista}
      />,
    );
    expect(html).toContain('data-problem-objave="greska"');
  });

  test("only the codes still open are listed; a warning offers Objavi again at once; no right, no button", () => {
    const dva = renderToStaticMarkup(
      <ProblemObjaveTraka problem={{ kodovi: ["name_missing", "price_missing"], greska: true }} stanje={{ ...STANJE, naziv: "", cena: 300 }} onObjavi={nista} />,
    );
    expect(tekst(dva)).toContain(menuDomenSr.publishIssues.name_missing);
    expect(tekst(dva)).not.toContain(menuDomenSr.publishIssues.price_missing);
    const upozorenje = renderToStaticMarkup(
      <ProblemObjaveTraka problem={{ kodovi: ["combo_price_check"], greska: false }} stanje={STANJE} onObjavi={nista} />,
    );
    expect(upozorenje).toContain('data-problem-objave="upozorenje"');
    expect(tekst(upozorenje)).toContain(p.upozorenje);
    expect(dugmad(upozorenje)).toEqual([p.ponovoObjavi]);
    const bezPrava = renderToStaticMarkup(
      <ProblemObjaveTraka problem={{ kodovi: ["price_missing"], greska: true }} stanje={{ ...STANJE, cena: 1 }} onObjavi={null} />,
    );
    expect(dugmad(bezPrava)).toEqual([]);
  });
});

const PREGLED: StudioPregledObjave = {
  revizija: 4,
  stanje: "dirty",
  mozeObjavu: true,
  menjaSe: true,
  prevelik: false,
  greske: [],
  upozorenja: [],
  otisak: "otisak",
  sazetak: { cene: 1, novi: 0, uklonjeni: 0, sakriveno: 0, uklonjenoSaStranice: 0, obrisano: 0, redosled: 0 },
  objavljenaVerzija: 7,
  ciljevi: {},
  promeneCena: [{ artikalKey: "a", naziv: "Ćevapi", pre: 1290, posle: 1390 }],
};
const SACUVANO: AutosaveZbir = { stanje: "sacuvano", neuspelo: 0, poslednjeU: null };

function modal(drugi: readonly string[] = []) {
  return renderToStaticMarkup(
    <ObjavaModal
      otvoreno
      onOtvoreno={nista}
      status={{ stanje: "dirty", objavljenaVerzija: 7, objavljenoU: IZLOG_SADA, revizija: 4 }}
      cuvanje={SACUVANO}
      sada={IZLOG_SADA}
      onPokusajCuvanje={nista}
      nazivArtikla={() => null}
      onPregled={() => Promise.reject(new Error("no"))}
      onObjavi={() => Promise.reject(new Error("no"))}
      onIdiNaArtikal={nista}
      onOtvoriPrevode={null}
      onPregledNacrta={nista}
      pocetno={{ pregled: PREGLED }}
      drugi={drugi}
      javniMeniHref="/demo-restoran/meni"
    />,
  );
}

describe("the publish dialog after the critique", () => {
  test("the safety sentence is in the footer (always visible), not in the scrolling body", () => {
    const html = modal();
    const telo = html.slice(html.indexOf('data-objava="pregled"'), html.indexOf("data-objava-sigurnost"));
    expect(html.match(/data-objava-sigurnost/g)).toHaveLength(1);
    // The footer comes after the body: the sentence stands right before the reason and the buttons.
    expect(html.indexOf("data-objava-sigurnost")).toBeLessThan(html.indexOf("data-objavi-potvrdi"));
    expect(telo).toContain("data-objava-posledice");
    expect(tekst(html)).toContain(fmt(o.modal.sigurnostVerzija, { broj: 7 }));
  });

  test("up to five changed prices are open at once", () => {
    expect(modal()).toMatch(/<details\b[^>]*\sopen=""[^>]*data-objava-cene|<details\b[^>]*data-objava-cene=""[^>]*\sopen=""/);
  });

  test("colleagues in the editor are named: what is saved is what goes out", () => {
    expect(modal()).not.toContain("data-objava-drugi");
    const jedan = modal(["Marko Ilić"]);
    expect(tekst(jedan)).toContain(fmt(o.modal.drugiUEditoru.jedan, { imena: "Marko Ilić" }));
    const dvoje = modal(["Jelena Kostić", "Marko Ilić"]);
    expect(tekst(dvoje)).toContain(fmt(o.modal.drugiUEditoru.vise, { imena: fmt(o.prisustvo.dvoje, { a: "Jelena Kostić", b: "Marko Ilić" }) }));
  });
});

describe("a detail field in conflict and the header", () => {
  test("a detail field shows this person's value too (its buttons do not carry it)", () => {
    const html = renderToStaticMarkup(
      <KonfliktPolja
        opis={opisKonflikta({ sacuvano: "Sa roštilja", pokusano: "Sa žara" }, (vrednost) => String(vrednost))}
        tekst="U međuvremenu je sačuvano: „Sa roštilja“."
        zadrziMoju={menuStudioSr.artikal.zadrziMoje}
        uzmiSacuvanu={menuStudioSr.artikal.uzmiSacuvano}
        onZadrziMoju={nista}
        onUzmiSacuvanu={nista}
        prikaziMoju
      />,
    );
    expect(tekst(html)).toContain(fmt(o.konflikt.moja, { vrednost: "Sa žara" }));
    // Both ways out weigh the same (the same button style).
    const klase = [...html.matchAll(/<button\b[^>]*class="([^"]*)"/g)].map((match) => match[1]);
    expect(klase).toHaveLength(2);
    expect(klase[0]).toBe(klase[1]);
  });

  test("on a phone, only conflicts waiting: 'Čeka Vaš izbor' and 'Idi na izbor', never 'Pokušaj ponovo'", () => {
    const html = renderToStaticMarkup(
      <StudioZaglavlje
        lokal="Demo restoran"
        rezim="ScanMe Menu · Ugostiteljstvo"
        sirina="telefon"
        tab="ponuda"
        onTab={nista}
        panelId="p"
        cuvanje={{ stanje: "greska", neuspelo: 1, poslednjeU: null }}
        status={{ stanje: "dirty", objavljenaVerzija: 7, objavljenoU: IZLOG_SADA }}
        povezano
        mozeObjavu
        prikaziPregled={false}
        onPregled={nista}
        onObjavi={nista}
        onIdiNaKonflikt={nista}
        sada={IZLOG_SADA}
      />,
    );
    expect(tekst(html)).toContain(o.konflikt.cekaIzbor);
    expect(dugmad(html)).toContain(o.konflikt.idiNaIzbor);
    expect(dugmad(html)).not.toContain(menuStudioSr.red.pokusajPonovo);
  });

  test("with the editor's clock the header phrases the live version's time like the dialogs do", () => {
    const html = renderToStaticMarkup(
      <StudioZaglavlje
        lokal="Demo restoran"
        rezim="ScanMe Menu · Ugostiteljstvo"
        sirina="desktop"
        tab="ponuda"
        onTab={nista}
        panelId="p"
        cuvanje={SACUVANO}
        status={{ stanje: "clean", objavljenaVerzija: 7, objavljenoU: IZLOG_SADA - 3 * 3_600_000 }}
        povezano
        mozeObjavu
        prikaziPregled
        onPregled={nista}
        onObjavi={nista}
        sada={IZLOG_SADA}
      />,
    );
    expect(tekst(html)).toContain(fmt(menuStudioSr.zaglavlje.danas, { vreme: "15:27" }));
  });
});
