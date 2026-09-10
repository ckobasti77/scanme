import { describe, expect, test } from "vitest";
import { defaults, itemDefaults, type MenuModel } from "../menu-blocks";
import { buildMenuPdf, encodeText, PDF_DIFFERENCES, wrapText } from "./pdf";
import { MENU_MAX_ITEMS } from "./rows";
import { modelWithItems } from "./rows.test";
import { TEST_LABELS, TEST_STAMP } from "./test-labels";

// Byte-faithful decode: one char per byte, so string indices ARE byte offsets
// (WHATWG's "latin1" TextDecoder is windows-1252 and would turn 0x8A into Š).
function latin1(bytes: Uint8Array): string {
  let out = "";
  for (let at = 0; at < bytes.length; at += 0x8000) {
    out += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  }
  return out;
}

function sampleModel(): MenuModel {
  const pice = defaults("lista");
  pice.base = { id: "g-pice", title: "Piće" };
  pice.items = [
    {
      ...itemDefaults(),
      id: "i-rakija",
      name: "Šljivovica (domaća) \\ čuvena",
      productType: "rakija",
      priceRsd: 250,
      description: "Kajmak, ajvar, pršuta — ide uz sve.\nDruga linija opisa.",
      variants: [
        { id: "v-03", label: "0.3 l", priceRsd: 250 },
        { id: "v-05", label: "0.5 l", priceRsd: 1650 },
      ],
    },
    {
      ...itemDefaults(),
      id: "i-kafa",
      name: "Domaća kafa",
      productType: "kafa",
      priceRsd: 180,
      available: false,
    },
  ];
  const jela = defaults("galerija");
  jela.base = { id: "g-jela", title: "Đačka jela" };
  jela.items = [
    { ...itemDefaults(), id: "i-cevapi", name: "Ćevapi", productType: "jelo", priceRsd: 890 },
  ];
  return { groups: [pice, jela], dayparts: [] };
}

function build(model: MenuModel) {
  return buildMenuPdf({ businessName: "Kafana kod Đorđa", stamp: TEST_STAMP, model, labels: TEST_LABELS });
}

// Walk the xref table and check every "N 0 obj" sits exactly at its offset.
function assertXrefValid(text: string) {
  const startxref = /startxref\n(\d+)\n%%EOF\n$/.exec(text);
  expect(startxref).not.toBeNull();
  const xrefAt = Number(startxref![1]);
  expect(text.slice(xrefAt, xrefAt + 4)).toBe("xref");
  const header = /^xref\n0 (\d+)\n/.exec(text.slice(xrefAt));
  const count = Number(header![1]);
  let cursor = xrefAt + header![0].length;
  for (let i = 0; i < count; i += 1) {
    const entry = text.slice(cursor, cursor + 20);
    expect(entry).toMatch(/^\d{10} \d{5} [fn] \n$/);
    if (i > 0) {
      const offset = Number(entry.slice(0, 10));
      expect(text.slice(offset, offset + `${i} 0 obj`.length)).toBe(`${i} 0 obj`);
    }
    cursor += 20;
  }
  return count - 1;
}

describe("menu PDF writer", () => {
  test("encodeText maps Serbian Latin to WinAnsi + the six Differences codes, others to ?", () => {
    const encoded = encodeText("čĆđŠž€„x“\tЋ");
    expect([...encoded].map((c) => c.charCodeAt(0))).toEqual([
      0x90, 0x81, 0x7f, 0x8a, 0x9e, 0x80, 0x84, 0x78, 0x93, 0x20, 0x3f,
    ]);
    expect(PDF_DIFFERENCES.map(([, name]) => name)).toEqual([
      "dcroat", "Cacute", "cacute", "Ccaron", "ccaron", "Dcroat",
    ]);
  });

  test("a valid file: header, binary marker, xref offsets, one page, footer, escaped literals", () => {
    const bytes = build(sampleModel());
    const text = latin1(bytes);
    expect(text.startsWith("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")).toBe(true);
    const objects = assertXrefValid(text);
    // 7 fixed objects + (page, contents) per page.
    expect(objects).toBe(7 + 2);
    expect(text).toContain("/Count 1");
    expect(text).toContain("(Strana 1 od 1)");
    expect(text).toContain("/Differences [127 /dcroat 129 /Cacute 141 /cacute 143 /Ccaron 144 /ccaron 157 /Dcroat]");
    // "( ) \" escaped inside the literal; "č" is byte 0x90, "Đ" 0x9D, "Š" 0x8A.
    expect(text).toContain("(\x8aljivovica \\(doma\x8da\\) \\\\ \x90uvena)");
    expect(text).toContain("\x9da\x90ka jela");
    expect(text).toContain("\x8aljivovica");
    // The unavailable marker and the grey price, the variant prices, the RSD grouping.
    expect(text).toContain("( \\(nema vi\x9ae\\))");
    expect(text).toContain("(1.650 RSD)");
    expect(text).toContain("/Title <FEFF");
    // Stream lengths are byte-exact.
    for (const match of text.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
      const start = match.index! + match[0].length;
      expect(text.slice(start + Number(match[1]), start + Number(match[1]) + 10)).toBe("\nendstream");
    }
  });

  test("wrapText breaks by words and splits an over-long word by characters", () => {
    expect(wrapText("Kajmak ajvar pršuta", "F1", 8.5, 60)).toEqual(["Kajmak ajvar", "pršuta"]);
    const lines = wrapText("a".repeat(200), "F1", 8.5, 100);
    expect(lines.length).toBeGreaterThan(5);
    expect(lines.join("")).toBe("a".repeat(200));
  });

  test("a long menu paginates; a group heading is never orphaned from its first item", () => {
    const model = modelWithItems(300, 37);
    const bytes = build(model);
    const text = latin1(bytes);
    assertXrefValid(text);
    const pages = Number(/\/Count (\d+)/.exec(text)![1]);
    expect(pages).toBeGreaterThan(3);
    expect(text).toContain(`(Strana ${pages} od ${pages})`);
    // Every content stream that contains a group heading also contains that
    // group's first item on the same page.
    const streams = [...text.matchAll(/stream\n([\s\S]*?)\nendstream/g)].map((m) => m[1]);
    for (let g = 0; g < model.groups.length; g += 1) {
      const heading = `(Grupa ${g})`;
      const first = `(${model.groups[g].items[0].name})`;
      const page = streams.find((s) => s.includes(heading));
      expect(page, heading).toBeDefined();
      expect(page!).toContain(first);
    }
  });

  test("2000 items build under 8 MiB; 2001 items are refused before anything is built", () => {
    const bytes = build(modelWithItems(MENU_MAX_ITEMS));
    expect(bytes.length).toBeLessThan(8 * 1024 * 1024);
    expect(() => build(modelWithItems(MENU_MAX_ITEMS + 1))).toThrow(/exceeds MENU_MAX_ITEMS/);
  });
});
