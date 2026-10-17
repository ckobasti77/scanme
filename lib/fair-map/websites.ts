// Organizer-published links, checked 17 Oct 2026:
// https://sajamautomobila.com/ucesnici-2026/
// Vespa, Aprilia and Piaggio use their official brand sites. The shared public
// loader's real exhibitor URL takes precedence; payment never gates the link.
const CAR_BOX = "https://www.polovniautomobili.com/car-box?ref=result-dealer-search";
const NIKOM = "https://nikom.co.rs/o_nama.html";

export const AMF_EXHIBITOR_WEBSITES: Readonly<Record<string, string>> = {
  skoda: "https://www.skoda-auto.rs/content/acp-nis",
  mercedes: "https://www.mercedes-benz-kemoimpexauto.rs/sr/desktop/passenger-cars.html",
  fiat: NIKOM,
  dongfeng: NIKOM,
  auto1: "https://www.auto1.com/sr/home",
  grawe: "https://www.grawe.rs/",
  geely: "https://www.geelyauto.rs/zastupnici",
  motogrini: "http://motogrini.rs/",
  tvs: "https://www.tvsmotor.com/",
  toyota: "https://www.toyota.rs/retailers/raavex-group-doo",
  citroen: "https://www.citroen.rs/alati/pronadji-prodajno-servisni-centar.html?searchTerm=raavex&path=L2NvbnRlbnQvY2l0cm9lbi93b3JsZHdpZGUvc2VyYmlhL3Jz&searchType=name",
  lotos: "https://hotellotos.rs/",
  vidovdan: "https://restoranvidovdan.rs/",
  vw: "https://www.brosauto.rs/",
  audi: "https://www.brosauto.rs/",
  mg: "https://www.mgmotor.rs/",
  ford: "https://ford.rs/",
  renault: "http://ackrunic.rs/",
  dacia: "https://dacia.ackrunic.rs/",
  peugeot: CAR_BOX,
  opel: CAR_BOX,
  suzuki: CAR_BOX,
  "honda-car": CAR_BOX,
  vespa: "https://www.vespa.com/",
  aprilia: "https://www.aprilia.com/",
  piaggio: "https://www.piaggio.com/",
  "honda-moto": CAR_BOX,
  raiffeisen: "https://www.raiffeisenbank.rs/sr/stanovnistvo.html",
};

/** Never offer executable or deliberately non-routable fixture destinations. */
export function fairMapWebsiteUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || /(?:^|\.)(?:invalid|test|localhost)$/.test(url.hostname)) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}
