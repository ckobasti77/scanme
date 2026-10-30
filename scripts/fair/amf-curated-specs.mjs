// AMF live hotfix, 30 Oct 2026: the curated spec sets and the four key tiles.
// Only spec kinds that already exist on other models (owner: consistent and
// not crowded, like Elektromobilnost). Sources: price lists, stand boards and
// the owner's hotfix brief; nothing is inferred. `highlights` are the labels
// of the four key tiles; `add` appends, `set` replaces a value or relabels.
const SKODA_TILES = ["Snaga", "Motor", "Menjač", "Potrošnja (WLTP)"];
const skoda = (engine, drive) => ({
  highlights: SKODA_TILES,
  add: [["Motor", engine], ["Menjač", "Automatski DSG"], ...(drive ? [["Pogon", drive]] : [])],
});

export const AMF_CURATED = {
  "skoda-superb": skoda("2,0 TDI", "4x4"),
  "skoda-kodiaq": skoda("2,0 TDI", "4x4"),
  "skoda-karoq": skoda("1,5 TSI"),
  "skoda-octavia": skoda("2,0 TDI"),
  "skoda-kamiq": skoda("1,0 TSI"),
  "skoda-fabia": skoda("1,0 TSI"),
  "swm-g01-pro": {
    highlights: ["Snaga", "Motor", "Menjač", "Potrošnja"],
    set: [["Tip motora", "1,5 TGDI", "Motor"]],
    add: [["Gorivo", "Benzin"]],
  },
  "fiat-grande-panda": {
    highlights: ["Snaga", "Motor", "Menjač", "Potrošnja"],
    set: [["Menjač", "Ručni, 6 brzina"]],
  },
  "mg-hs-hybrid": { highlights: ["Snaga", "Motor", "Potrošnja (WLTP)", "Emisija CO₂ (WLTP)"] },
  "mg-zs-hybrid": {
    highlights: ["Snaga", "Motor", "Potrošnja (WLTP)", "Emisija CO₂ (WLTP)"],
    set: [["Motor", "1,5 l Hybrid+"]],
    priceText: "23.990 €",
    priceSecondaryText: "Akcijska cena, Luxury",
  },
  "dongfeng-forthing-t5-hev": { highlights: ["Kapacitet baterije", "Snaga", "Motor", "Potrošnja"] },
  "dongfeng-box": { highlights: ["WLTP domet", "Kapacitet baterije", "Snaga", "Brzo punjenje (30%–80%)"] },
  "dongfeng-m-hero-817": {
    highlights: ["Električni domet (VLTC)", "Kapacitet baterije", "Snaga", "Brzo punjenje"],
    set: [["Zapremina prtljažnika", "828–2.112 l"]],
  },
  "ford-kuga": {
    highlights: ["Snaga", "Motor", "Menjač", "Gorivo"],
    replace: [
      ["Motor", "1,5 EcoBoost"],
      ["Gorivo", "Benzin"],
      ["Snaga", "137 kW / 186 KS"],
      ["Menjač", "Automatski, 8 brzina"],
      ["Dostupni motori (ST-Line)", "1,5 EcoBoost 110 kW / 150 KS, ručni 6: 28.990 €; 1,5 EcoBoost 137 kW / 186 KS, automatski 8: 27.490 €; 2,5 FHEV 132 kW / 180 KS, automatski CVT: 34.990 €; 2,5 FHEV 134 kW / 183 KS, automatski CVT: 37.990 €; 2,5 PHEV 178 kW / 243 KS, automatski CVT: cena nije navedena"],
      ["Zapremina prtljažnika", "do 536 l"],
      ["Naplatci", "18\" aluminijumske felne 225/60 R18"],
      ["Ogibljenje", "Sportsko ogibljenje"],
      ["Ekran osetljiv na dodir", "13,2\""],
      ["Digitalna instrument tabla", "12,3\""],
    ],
    priceText: "od 27.490 €",
    priceSecondaryText: "ST-Line, 1,5 EcoBoost automatski 8",
  },
  "ford-puma-mhev": {
    highlights: ["Snaga", "Motor", "Menjač", "Gorivo"],
    replace: [
      ["Motor", "1,0 EcoBoost mHEV"],
      ["Gorivo", "Benzin, blagi hibrid"],
      ["Snaga", "92 kW / 125 KS"],
      ["Menjač", "Automatski, 7 brzina"],
      ["Dostupni motori (ST-Line)", "1,0 EcoBoost mHEV 92 kW / 125 KS, ručni 6: 19.740 €; 1,0 EcoBoost mHEV 92 kW / 125 KS, automatski 7: 21.740 €; 1,0 EcoBoost mHEV 114 kW / 155 KS, automatski 7: 22.740 €"],
      ["Zapremina prtljažnika", "456 l (1.126 l sa preklopljenim sedištima)"],
      ["Naplatci", "17\" aluminijumski naplatci 215/55 R17 94H"],
      ["Centralni ekran", "12\""],
      ["Digitalna kontrolna tabla vozača", "12,8\""],
    ],
    priceText: "od 21.740 €",
    priceSecondaryText: "ST-Line, 1,0 EcoBoost mHEV automatski 7",
  },
  "ford-ranger-raptor": {
    highlights: ["Snaga", "Motor", "Gorivo", "Menjač"],
    replace: [
      ["Motor", "3,0 EcoBoost V6"],
      ["Gorivo", "Benzin"],
      ["Snaga", "215 kW / 292 KS"],
      ["Menjač", "Automatski, 10 brzina"],
      ["Pneumatici", "285/70 R17 (17\" aluminijumski naplatci)"],
    ],
    priceText: "83.988 €",
    priceSecondaryText: "Akcijska cena 69.990 € bez PDV-a",
  },
  "ineos-grenadier": {
    highlights: ["Snaga", "Motor", "Menjač", "Pogon"],
    replace: [
      ["Motor", "3,0 BMW"],
      ["Tip motora", "Redni šestocilindrični"],
      ["Gorivo", "Benzin"],
      ["Zapremina", "2.998 cm³"],
      ["Snaga", "210 kW / 282 KS"],
      ["Obrtni moment", "450 Nm"],
      ["Menjač", "Automatski, 8 brzina"],
      ["Pogon", "4x4"],
      ["Potrošnja", "15,6–16,8 l/100 km"],
      ["Emisija CO₂", "325–336 g/km"],
      ["Dostupni motori", "3,0 BMW benzin 210 kW / 282 KS, 2.998 cm³, 450 Nm; 3,0 BMW dizel 183 kW / 245 KS, 2.993 cm³, 550 Nm"],
      ["Dužina × širina × visina", "4.895 × 1.930 × 2.036 mm (dužina sa rezervnim točkom)"],
      ["Međuosovinsko rastojanje", "2.922 mm"],
      ["Broj sedišta", "5"],
      ["Pneumatici", "265/70 R17 (17\" čelični naplatci)"],
    ],
  },
};

/** Applies the curation to one model whose specifications are `{ label, value, order }` pairs. */
export function applyAmfCuration(model) {
  const curation = AMF_CURATED[model.slug];
  if (!curation) return model;
  let pairs = curation.replace ?? model.specifications.map((spec) => [spec.label, spec.value]);
  for (const [label, value, relabel] of curation.set ?? []) {
    if (!pairs.some(([l]) => l === label)) throw new Error(`AMF_CURATION_MISSING ${model.slug} ${label}`);
    pairs = pairs.map(([l, v]) => (l === label ? [relabel ?? l, value] : [l, v]));
  }
  pairs = [...pairs, ...(curation.add ?? [])];
  const specifications = pairs.map(([label, value], index) => ({
    label, value, order: index + 1,
    ...(curation.highlights.includes(label) ? { isHighlight: true } : {}),
  }));
  const found = specifications.filter((spec) => spec.isHighlight).length;
  if (found !== curation.highlights.length) throw new Error(`AMF_CURATION_HIGHLIGHTS ${model.slug}`);
  return {
    ...model,
    specifications,
    ...(curation.priceText ? { priceText: curation.priceText } : {}),
    ...(curation.priceSecondaryText ? { priceSecondaryText: curation.priceSecondaryText } : {}),
  };
}
