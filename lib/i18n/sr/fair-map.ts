import type { FairMapDict } from "../types";

export const fairMapSr = {
  overlayTitle: "Preklop geometrije mape",
  overlayIntro:
    "Razvojna provera: poligoni lokacija (mapLocationId) preko izvornih mapa organizatora. Ovo nije izgled javne mape.",
  overlayDraft: "Radni nacrt",
  overlayAria: "{event}, {zone}: mapa organizatora sa poligonima lokacija",
  overlayCaption: "{zone} · lokacija: {count} · izvor: {file}, preuzeto {date}",
  overlayPlaceholder: "položaj nije potvrđen",
  events: {
    "elektromobilnost-2026": "Sajam elektromobilnosti",
    "auto-moto-fest-2026": "Auto Moto Fest",
  },
  zones: {
    hala: "Hala",
    ispred: "Ispred hale",
  },
} as const satisfies FairMapDict;
