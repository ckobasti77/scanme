// ScanMe Menu V1 — K11: the group price change of `Izaberi više`. Covers the
// validation of the change itself (percent bounds and decimals, whole-dinar
// amounts, "ista cena"), the integer round-half-up rule of `novaCena`, the
// before -> after plan for a list of articles (variants, missing prices, equal
// results, negative and too large results, duplicates), the payload sent to the
// server and the way the owner's percentage is read.

import { describe, expect, test } from "vitest";
import {
  PROCENAT_MAX,
  PROCENAT_MIN,
  izmeneCena,
  novaCena,
  parseProcenat,
  planCena,
  proveriPromenu,
  type CenaArtikla,
  type PromenaCene,
  type SmerPromene,
} from "./bulk-price";

const procenat = (smer: SmerPromene, vrednost: number): PromenaCene => ({ nacin: "procenat", smer, vrednost });
const iznos = (smer: SmerPromene, vrednost: number): PromenaCene => ({ nacin: "iznos", smer, vrednost });
const ista = (vrednost: number): PromenaCene => ({ nacin: "ista", vrednost });

function artikal(artikalId: string, cena: number | null, varijante = false): CenaArtikla {
  return { artikalId, naziv: `Artikal ${artikalId}`, cena, varijante };
}

describe("proveriPromenu: percent", () => {
  test("the bounds are 0.01 and 300, both inclusive", () => {
    expect(PROCENAT_MIN).toBe(0.01);
    expect(PROCENAT_MAX).toBe(300);
    expect(proveriPromenu(procenat("povecaj", 0.01))).toBeNull();
    expect(proveriPromenu(procenat("povecaj", 300))).toBeNull();
    expect(proveriPromenu(procenat("smanji", 0.01))).toBeNull();
  });

  test.each([0, 0.009, -5, 300.01, 301, 1000])("%j up is out of range", (vrednost) => {
    expect(proveriPromenu(procenat("povecaj", vrednost))).toBe("procenat_opseg");
  });

  test("out of range wins over everything else for a decrease", () => {
    expect(proveriPromenu(procenat("smanji", 0))).toBe("procenat_opseg");
    expect(proveriPromenu(procenat("smanji", 301))).toBe("procenat_opseg");
  });

  test("a decrease of exactly 100 % is allowed, more than 100 % is not", () => {
    expect(proveriPromenu(procenat("smanji", 100))).toBeNull();
    expect(proveriPromenu(procenat("smanji", 100.01))).toBe("procenat_smanjenje");
    expect(proveriPromenu(procenat("smanji", 101))).toBe("procenat_smanjenje");
    expect(proveriPromenu(procenat("smanji", 300))).toBe("procenat_smanjenje");
  });

  test("an increase of more than 100 % is fine", () => {
    expect(proveriPromenu(procenat("povecaj", 101))).toBeNull();
    expect(proveriPromenu(procenat("povecaj", 250))).toBeNull();
  });

  test("at most two decimals", () => {
    for (const vrednost of [10, 10.5, 7.25, 33.33, 0.1, 99.99, 12.3]) {
      expect(proveriPromenu(procenat("povecaj", vrednost)), String(vrednost)).toBeNull();
    }
    for (const vrednost of [10.555, 0.015, 7.251, 33.333, 1.001]) {
      expect(proveriPromenu(procenat("povecaj", vrednost)), String(vrednost)).toBe("procenat_decimale");
    }
  });

  test("NaN and infinities are out of range", () => {
    for (const vrednost of [Number.NaN, Infinity, -Infinity]) {
      expect(proveriPromenu(procenat("povecaj", vrednost))).toBe("procenat_opseg");
      expect(proveriPromenu(procenat("smanji", vrednost))).toBe("procenat_opseg");
    }
  });
});

describe("proveriPromenu: amount", () => {
  test("a whole number from 1 to 1.000.000", () => {
    expect(proveriPromenu(iznos("povecaj", 1))).toBeNull();
    expect(proveriPromenu(iznos("smanji", 50))).toBeNull();
    expect(proveriPromenu(iznos("povecaj", 1_000_000))).toBeNull();
  });

  test.each([0, -1, -100, 1_000_001])("%j is out of range", (vrednost) => {
    expect(proveriPromenu(iznos("povecaj", vrednost))).toBe("iznos_opseg");
    expect(proveriPromenu(iznos("smanji", vrednost))).toBe("iznos_opseg");
  });

  test.each([1.5, 0.5, 99.99])("%j is not a whole number", (vrednost) => {
    expect(proveriPromenu(iznos("povecaj", vrednost))).toBe("iznos_ceo");
  });

  test("NaN and infinities", () => {
    for (const vrednost of [Number.NaN, Infinity, -Infinity]) {
      expect(proveriPromenu(iznos("povecaj", vrednost))).toBe("iznos_opseg");
    }
  });
});

describe("proveriPromenu: one price for all", () => {
  test("0 to 1.000.000 whole dinars", () => {
    expect(proveriPromenu(ista(0))).toBeNull();
    expect(proveriPromenu(ista(1))).toBeNull();
    expect(proveriPromenu(ista(1490))).toBeNull();
    expect(proveriPromenu(ista(1_000_000))).toBeNull();
  });

  test.each([-1, 1_000_001, 1.5, 0.5])("%j is not a valid price", (vrednost) => {
    expect(proveriPromenu(ista(vrednost))).toBe("cena_neispravna");
  });

  test("NaN and infinities", () => {
    for (const vrednost of [Number.NaN, Infinity, -Infinity]) {
      expect(proveriPromenu(ista(vrednost))).toBe("cena_neispravna");
    }
  });
});

describe("novaCena: percent, rounded half up to whole dinars", () => {
  test.each<[number, SmerPromene, number, number]>([
    [245, "povecaj", 10, 270], // 269.5 rounds up
    [1450, "povecaj", 10, 1595],
    [220, "smanji", 10, 198],
    [225, "smanji", 10, 203], // 202.5 rounds up
    [1, "povecaj", 50, 2], // 1.5
    [1, "smanji", 50, 1], // 0.5
    [3, "smanji", 50, 2], // 1.5
    [1, "povecaj", 10, 1], // 1.1
    [1, "povecaj", 40, 1], // 1.4
    [1, "povecaj", 49, 1], // 1.49
    [1000, "povecaj", 0.01, 1000], // 1000.1
    [1000, "povecaj", 0.05, 1001], // 1000.5
    [1000, "povecaj", 0.04, 1000], // 1000.4
    [333, "povecaj", 33.33, 444], // 443.9889
    [333, "smanji", 33.33, 222], // 222.0111
    [100, "povecaj", 7.25, 107], // 107.25
    [100, "povecaj", 7.5, 108], // 107.5
    [199, "povecaj", 12.5, 224], // 223.875
    [500, "smanji", 100, 0],
    [0, "povecaj", 10, 0],
    [200, "povecaj", 300, 800],
    [1_000_000, "povecaj", 1, 1_010_000],
  ])("%j %s %j %% = %j", (stara, smer, vrednost, ocekivano) => {
    expect(novaCena(stara, procenat(smer, vrednost))).toBe(ocekivano);
  });

  test("the result is always a whole number, also for awkward percentages", () => {
    for (const stara of [1, 7, 99, 245, 333, 999, 12_345]) {
      for (const vrednost of [0.01, 0.07, 3.33, 12.5, 33.33, 66.67, 99.99]) {
        expect(Number.isInteger(novaCena(stara, procenat("povecaj", vrednost)))).toBe(true);
        expect(Number.isInteger(novaCena(stara, procenat("smanji", vrednost)))).toBe(true);
      }
    }
  });
});

describe("novaCena: amount and one price", () => {
  test("adds or takes away whole dinars", () => {
    expect(novaCena(100, iznos("povecaj", 50))).toBe(150);
    expect(novaCena(100, iznos("smanji", 30))).toBe(70);
    expect(novaCena(100, iznos("smanji", 100))).toBe(0);
  });

  test("can go below zero or above the maximum (the plan marks those invalid)", () => {
    expect(novaCena(100, iznos("smanji", 150))).toBe(-50);
    expect(novaCena(999_999, iznos("povecaj", 2))).toBe(1_000_001);
  });

  test("one price ignores the old price", () => {
    expect(novaCena(100, ista(500))).toBe(500);
    expect(novaCena(0, ista(250))).toBe(250);
    expect(novaCena(900, ista(0))).toBe(0);
  });
});

describe("planCena", () => {
  test("a plain change: old, new and the difference, in the order given", () => {
    const plan = planCena([artikal("b", 200), artikal("a", 100), artikal("c", 300)], procenat("povecaj", 10));
    expect(plan.promene).toEqual([
      { artikalId: "b", naziv: "Artikal b", stara: 200, nova: 220, razlika: 20 },
      { artikalId: "a", naziv: "Artikal a", stara: 100, nova: 110, razlika: 10 },
      { artikalId: "c", naziv: "Artikal c", stara: 300, nova: 330, razlika: 30 },
    ]);
    expect(plan.preskoceni).toEqual([]);
    expect(plan.nevazeci).toEqual([]);
    expect(plan.mozePotvrdu).toBe(true);
  });

  test("a decrease has a negative difference", () => {
    const plan = planCena([artikal("a", 220)], procenat("smanji", 10));
    expect(plan.promene).toEqual([{ artikalId: "a", naziv: "Artikal a", stara: 220, nova: 198, razlika: -22 }]);
  });

  test("an article with variants is skipped, whatever the change", () => {
    for (const promena of [procenat("povecaj", 10), iznos("povecaj", 10), ista(500)]) {
      const plan = planCena([artikal("v", 100, true), artikal("a", 100)], promena);
      expect(plan.preskoceni).toEqual([{ artikalId: "v", naziv: "Artikal v", stara: 100, razlog: "varijante" }]);
      expect(plan.promene.map((red) => red.artikalId)).toEqual(["a"]);
    }
    const bezCene = planCena([artikal("v", null, true), artikal("a", 100)], ista(500));
    expect(bezCene.preskoceni).toEqual([{ artikalId: "v", naziv: "Artikal v", stara: null, razlog: "varijante" }]);
  });

  test("an article without a price is skipped for a percentage or an amount", () => {
    for (const promena of [procenat("povecaj", 10), procenat("smanji", 10), iznos("povecaj", 10), iznos("smanji", 10)]) {
      const plan = planCena([artikal("n", null), artikal("a", 100)], promena);
      expect(plan.preskoceni).toEqual([{ artikalId: "n", naziv: "Artikal n", stara: null, razlog: "bez_cene" }]);
      expect(plan.promene.map((red) => red.artikalId)).toEqual(["a"]);
    }
  });

  test("an article without a price gets the price for `ista cena`, with no difference", () => {
    const plan = planCena([artikal("n", null), artikal("a", 100)], ista(500));
    expect(plan.promene).toEqual([
      { artikalId: "n", naziv: "Artikal n", stara: null, nova: 500, razlika: null },
      { artikalId: "a", naziv: "Artikal a", stara: 100, nova: 500, razlika: 400 },
    ]);
    expect(plan.preskoceni).toEqual([]);
    expect(plan.mozePotvrdu).toBe(true);
  });

  test("an equal result is skipped as `bez_promene`", () => {
    const plan = planCena([artikal("a", 500), artikal("z", 0), artikal("t", 1), artikal("b", 100)], ista(500));
    expect(plan.preskoceni).toEqual([{ artikalId: "a", naziv: "Artikal a", stara: 500, razlog: "bez_promene" }]);
    expect(plan.promene.map((red) => red.artikalId)).toEqual(["z", "t", "b"]);

    const mali = planCena([artikal("t", 1), artikal("z", 0), artikal("b", 100)], procenat("povecaj", 10));
    expect(mali.preskoceni).toEqual([
      { artikalId: "t", naziv: "Artikal t", stara: 1, razlog: "bez_promene" },
      { artikalId: "z", naziv: "Artikal z", stara: 0, razlog: "bez_promene" },
    ]);
    expect(mali.promene.map((red) => red.artikalId)).toEqual(["b"]);
  });

  test("when nothing changes the plan cannot be confirmed", () => {
    expect(planCena([artikal("a", 500)], ista(500)).mozePotvrdu).toBe(false);
    expect(planCena([artikal("v", 100, true), artikal("n", null)], procenat("povecaj", 10)).mozePotvrdu).toBe(false);
    expect(planCena([], procenat("povecaj", 10))).toEqual({ promene: [], preskoceni: [], nevazeci: [], mozePotvrdu: false });
  });

  test("a negative result is invalid and blocks the whole change", () => {
    const plan = planCena([artikal("a", 100), artikal("b", 100)], iznos("smanji", 150));
    expect(plan.nevazeci).toEqual([
      { artikalId: "a", naziv: "Artikal a", stara: 100, nova: -50, razlog: "negativna" },
      { artikalId: "b", naziv: "Artikal b", stara: 100, nova: -50, razlog: "negativna" },
    ]);
    expect(plan.promene).toEqual([]);
    expect(plan.mozePotvrdu).toBe(false);

    const mesano = planCena([artikal("ok", 500), artikal("lose", 100)], iznos("smanji", 150));
    expect(mesano.promene.map((red) => red.artikalId)).toEqual(["ok"]);
    expect(mesano.nevazeci.map((red) => red.artikalId)).toEqual(["lose"]);
    expect(mesano.mozePotvrdu).toBe(false);
  });

  test("a result of exactly 0 is valid", () => {
    const plan = planCena([artikal("a", 100)], iznos("smanji", 100));
    expect(plan.promene).toEqual([{ artikalId: "a", naziv: "Artikal a", stara: 100, nova: 0, razlika: -100 }]);
    expect(plan.mozePotvrdu).toBe(true);
  });

  test("a result above 1.000.000 is `prevelika` and blocks the change", () => {
    const plan = planCena([artikal("a", 999_999), artikal("b", 100)], iznos("povecaj", 2));
    expect(plan.nevazeci).toEqual([{ artikalId: "a", naziv: "Artikal a", stara: 999_999, nova: 1_000_001, razlog: "prevelika" }]);
    expect(plan.promene.map((red) => red.artikalId)).toEqual(["b"]);
    expect(plan.mozePotvrdu).toBe(false);
  });

  test("a result of exactly 1.000.000 is valid", () => {
    const plan = planCena([artikal("a", 999_999)], iznos("povecaj", 1));
    expect(plan.promene).toEqual([{ artikalId: "a", naziv: "Artikal a", stara: 999_999, nova: 1_000_000, razlika: 1 }]);
    expect(plan.nevazeci).toEqual([]);
    expect(plan.mozePotvrdu).toBe(true);
  });

  test("the same article twice counts once (first occurrence)", () => {
    const plan = planCena([artikal("a", 100), artikal("b", 200), artikal("a", 999), artikal("b", null)], procenat("povecaj", 10));
    expect(plan.promene).toEqual([
      { artikalId: "a", naziv: "Artikal a", stara: 100, nova: 110, razlika: 10 },
      { artikalId: "b", naziv: "Artikal b", stara: 200, nova: 220, razlika: 20 },
    ]);
    expect(plan.preskoceni).toEqual([]);
  });

  test("an invalid change gives an empty plan that cannot be confirmed", () => {
    const prazan = { promene: [], preskoceni: [], nevazeci: [], mozePotvrdu: false };
    const artikli = [artikal("a", 100), artikal("v", 100, true), artikal("n", null)];
    expect(planCena(artikli, procenat("povecaj", 0))).toEqual(prazan);
    expect(planCena(artikli, procenat("smanji", 150))).toEqual(prazan);
    expect(planCena(artikli, procenat("povecaj", 10.555))).toEqual(prazan);
    expect(planCena(artikli, iznos("povecaj", 1.5))).toEqual(prazan);
    expect(planCena(artikli, iznos("smanji", 0))).toEqual(prazan);
    expect(planCena(artikli, ista(-1))).toEqual(prazan);
    expect(planCena(artikli, ista(Number.NaN))).toEqual(prazan);
  });

  test("every article ends up in exactly one list", () => {
    const artikli = [
      artikal("ok", 100),
      artikal("isti", 500),
      artikal("var", 100, true),
      artikal("bez", null),
      artikal("veliki", 999_999),
    ];
    const plan = planCena(artikli, ista(500));
    const sviIds = [...plan.promene, ...plan.preskoceni, ...plan.nevazeci].map((red) => red.artikalId).sort();
    expect(sviIds).toEqual(["bez", "isti", "ok", "var", "veliki"]);
  });
});

describe("izmeneCena", () => {
  test("every changed price with the price the owner saw", () => {
    const plan = planCena([artikal("n", null), artikal("a", 100), artikal("s", 500), artikal("v", 100, true)], ista(500));
    expect(izmeneCena(plan)).toEqual([
      { artikalId: "n", ocekivana: null, nova: 500 },
      { artikalId: "a", ocekivana: 100, nova: 500 },
    ]);
  });

  test("skipped and invalid rows are not sent; an empty plan sends nothing", () => {
    const plan = planCena([artikal("a", 100), artikal("lose", 50)], iznos("smanji", 80));
    expect(izmeneCena(plan)).toEqual([{ artikalId: "a", ocekivana: 100, nova: 20 }]);
    expect(izmeneCena(planCena([], ista(500)))).toEqual([]);
  });
});

describe("parseProcenat", () => {
  test.each<[string, number]>([
    ["10", 10],
    ["10,5", 10.5],
    ["10.5", 10.5],
    ["7.25", 7.25],
    ["7,25", 7.25],
    ["0.5", 0.5],
    ["0,01", 0.01],
    ["300", 300],
    ["5", 5],
    ["10 %", 10],
    ["10%", 10],
    ["  10  % ", 10],
    ["  12,5%", 12.5],
  ])("%j is %j", (tekst, ocekivano) => {
    expect(parseProcenat(tekst)).toBe(ocekivano);
  });

  test.each(["1.234", "1,234", "abc", "-5", "+5", "10.555", "", "   ", "%", "1000", ".5", "10.", "1 0", "10 %%", "1e2", "10 posto"])(
    "%j is refused",
    (tekst) => {
      expect(parseProcenat(tekst)).toBeNull();
    },
  );
});
