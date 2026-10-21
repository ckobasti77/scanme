// K34 (REVIZIJA N17): the writes the article detail calls directly ("Ukloni sa stranice", "Dodaj na
// stranicu", the section of the article, "Primeni i na druge artikle", "Zadrži cenu", "Izmeni sastav")
// used to run past the save queue, so the header kept "Sačuvano" and closing the tab did not warn while
// one was in flight. The real editor (izlog, detail open) is rendered with the queue and the detail
// captured: every one of these actions it hands the detail is tracked by the queue.
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { EditorIzlog } from "@/components/menu/izlog/editor-izlog";
import type { AutosaveRed } from "@/lib/menu/studio/autosave-queue";
import { parseEditorPreview } from "@/lib/menu/izlog-params";
import type { StudioRadnje } from "@/lib/menu/studio/model";

const uhvaceno = vi.hoisted(() => ({ red: null as AutosaveRed | null, radnje: null as StudioRadnje | null }));

vi.mock("./status-cuvanja/use-autosave", async () => {
  const { AutosaveRed: Red } = await import("@/lib/menu/studio/autosave-queue");
  return {
    useAutosave: (pripremi?: (red: AutosaveRed) => void) => {
      const red = new Red();
      pripremi?.(red);
      uhvaceno.red = red;
      return red;
    },
  };
});

vi.mock("./artikal/detalj-artikla", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./artikal/detalj-artikla")>()),
  DetaljArtikla: (props: { radnje: StudioRadnje }) => {
    uhvaceno.radnje = props.radnje;
    return null;
  },
}));

const PRACENE = [
  "ukloniSaStranice",
  "dodajPostojeci",
  "premestiPrikaz",
  "primeniGrupuNa",
  "zadrziCenuKomboa",
  "postaviSastav",
] as const;

const ARGUMENTI: Record<(typeof PRACENE)[number], unknown[]> = {
  ukloniSaStranice: [["nepostojeci-prikaz"]],
  dodajPostojeci: ["nepostojeca-sekcija", "nepostojeci-artikal"],
  premestiPrikaz: ["nepostojeci-prikaz", "nepostojeca-sekcija", null],
  primeniGrupuNa: ["nepostojeca-grupa", ["nepostojeci-artikal"]],
  zadrziCenuKomboa: ["nepostojeci-kombo"],
  postaviSastav: ["nepostojeci-kombo", []],
};

beforeAll(() => {
  renderToStaticMarkup(<EditorIzlog params={parseEditorPreview({ fokus: "artikal" })} />);
}, 60_000);

describe("K34 N17: the article detail's direct writes go through the save queue", () => {
  test("the detail is rendered with the editor's queue", () => {
    expect(uhvaceno.radnje).not.toBeNull();
    expect(uhvaceno.red?.zbir().stanje).toBe("sacuvano");
  });

  test.each(PRACENE)('%s: "Čuva se…" and the leave warning while it runs, nothing pending after', async (ime) => {
    const red = uhvaceno.red as AutosaveRed;
    const radnja = (uhvaceno.radnje as StudioRadnje)[ime] as (...args: unknown[]) => Promise<unknown>;

    const poziv = radnja(...ARGUMENTI[ime]);
    expect(red.zbir().stanje).toBe("cuva-se");
    expect(red.imaNesacuvano()).toBe(true);

    await poziv;
    expect(red.zbir().stanje).not.toBe("cuva-se");
    expect(red.imaNesacuvano()).toBe(false);
  });
});
