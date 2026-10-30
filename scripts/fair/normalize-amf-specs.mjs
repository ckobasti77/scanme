// Display-only normalization of AMF intake. Never select an engine/variant or
// infer a measurement standard that the exhibitor did not supply.
const fold = (s) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
const thousands = (s) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const decimal = (s) => s.replace(/(\d)\.(\d)/g, "$1,$2");

export function normalizeAmfSpecs(specifications) {
  let specs = specifications.map((spec) => {
    let { label, value } = spec;
    const key = fold(label);
    if (/snaga kw/.test(key)) {
      value = value.replace(/^(\d+)\s*\((\d+)\)$/, "$1 kW / $2 KS");
      label = "Snaga";
    } else if (/maksimalna snaga/.test(key)) label = "Snaga";
    else if (/obrtni moment/.test(key)) {
      label = "Obrtni moment";
      value = value.replace(/^(\d+)\/([\d.]+)-([\d.]+) Nm\/min\.$/, (_, torque, from, to) => `${torque} Nm (${thousands(from.replaceAll(".", ""))}–${thousands(to.replaceAll(".", ""))} o/min)`);
      value = value.replace(/^(\d+) Nm (?:pri|\/) ([\d]+)(?:[–-]([\d]+))? o\/min$/, (_, torque, from, to) => `${torque} Nm (${thousands(from)}${to ? `–${thousands(to)}` : ""} o/min)`);
    } else if (/potrosnj/.test(key)) {
      label = /wltp/.test(key) ? "Potrošnja (WLTP)" : "Potrošnja";
      value = decimal(value).replace(/^(\d+,?\d*)\/100 km$/, "$1 l/100 km");
      if (/^[\d,]+$/.test(value)) value += " l/100 km";
    } else if (/co[₂2]/.test(key)) label = /wltp/.test(key) ? "Emisija CO₂ (WLTP)" : "Emisija CO₂";
    else if (/goriv/.test(key)) {
      label = "Gorivo";
      value = value.charAt(0).toUpperCase() + value.slice(1);
    } else if (/rezervoar/.test(key)) label = "Rezervoar";
    else if (/^(zapremina|zapremina motora)$/.test(key)) {
      label = "Zapremina";
      value = value.replace(/^(\d+) (?:cc|cm³)$/, (_, n) => `${thousands(n)} cm³`);
    } else if (/duzina.*(?:sirina|visina)/.test(key)) {
      const nums = value.match(/\d+/g);
      if (nums?.length === 3) {
        if (/duzina\/visina\/sirina/.test(key)) [nums[1], nums[2]] = [nums[2], nums[1]];
        label = "Dužina × širina × visina";
        value = nums.map(thousands).join(" × ") + " mm";
      }
    } else if (/tezina prema din/.test(key)) {
      label = "Masa (DIN)";
      if (!/kg$/.test(value)) value += " kg";
    } else if (/maksimalna brzina/.test(key)) {
      label = "Maksimalna brzina";
      if (!/km\/h$/.test(value)) value += " km/h";
    } else if (/ubrzanje/.test(key)) {
      label = "Ubrzanje 0–100 km/h";
      value = decimal(value);
      if (!/s$/.test(value)) value += " s";
    }
    value = value.replace(/(\d)\s*kW\s*\/\s*(\d+)\s*ks\b/gi, "$1 kW / $2 KS")
      .replace(/(\d)\s*[-–]\s*(?=\d)/g, "$1–")
      .replace(/\b(\d{4,})(?=\s*(?:mm|kg|l|o\/min)\b)/g, thousands)
      .replace(/(\d)\.([\d]+)(?=\s*(?:l|L)\b)/g, "$1,$2")
      .replace(/(\d)(?:l|L)\b/g, "$1 l")
      .replace(/(\d)PS\b/g, "$1 KS");
    if (/^(Motor|Tip motora)$/.test(label)) value = decimal(value);
    return { ...spec, label, value };
  });
  const dimensions = ["Dužina", "Širina", "Visina"].map((label) => specs.find((s) => s.label === label));
  if (dimensions.every(Boolean)) {
    const first = dimensions[0];
    specs = specs.filter((s) => !dimensions.slice(1).includes(s)).map((s) => s === first
      ? { ...s, label: "Dužina × širina × visina", value: dimensions.map((d) => d.value.replace(/ mm$/, "")).join(" × ") + " mm" } : s);
  }
  const priority = (label) => {
    const key = fold(label);
    if (/snag|moment|zapremina$|pogon|motor|menjac|gorivo|potrosnj|emisij|domet|baterij|punjenj|ubrzanj|brzina|rezervoar/.test(key)) return 0;
    if (/duzina|sirina|visina|rastojanje|staza/.test(key)) return 1;
    return 2;
  };
  return specs.sort((a, b) => priority(a.label) - priority(b.label)).map((spec, index) => ({ ...spec, order: index + 1 }));
}

export function normalizeAmfModel(model) {
  const next = { ...model, specifications: normalizeAmfSpecs(model.specifications) };
  if (model.slug === "skoda-karoq") delete next.priceSecondaryText;
  return next;
}
