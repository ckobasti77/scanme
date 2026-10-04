// Dev/test fixtures for the Menu render layer (TASK-51): one fully-populated
// kafana menu — every one of the five shapes with believable Serbian content,
// variants, cross-group pairings, a "nema više" item, photo and photo-less
// items — plus a dark design variant. Consumed by the render smoke test; a
// future /dev preview may reuse it. Never imported by a public route.

import {
  DEFAULT_MENU_DESIGN,
  type MenuDesign,
} from "@/lib/design-engine/menu-tokens";
import { itemDefaults, type MenuItem, type MenuModel } from "@/lib/menu-blocks";
import type { MenuPageView } from "./menu-view";

export const DARK_MENU_DESIGN: MenuDesign = {
  version: 1,
  colors: {
    page: "#14161A",
    surface: "#1E2126",
    title: "#F2EFE9",
    body: "#C9C4BA",
    accent: "#D9A662",
    border: "#2E323A",
    focus: "#D9A662",
    icon: "#D9A662",
  },
  typography: {
    fontKey: "playfair-display",
    headingWeight: 600,
    bodyWeight: 400,
    alignment: "left",
    scale: "medium",
    lineHeight: 1.55,
    verticalSpacing: 18,
  },
  background: { category: "flat", color: "#14161A" },
};

function item(
  id: string,
  name: string,
  productType: string,
  extra: Partial<MenuItem> = {},
): MenuItem {
  return { ...itemDefaults(), id, name, productType, ...extra };
}

export function fixtureModel(): MenuModel {
  return {
    groups: [
      {
        shape: "istaknuto",
        base: { id: "g-hit", title: "Specijalitet kuće" },
        items: [
          item("i-karadjordjeva", "Karađorđeva šnicla", "rostilj", {
            description: "Punjena kajmakom, sa tartar sosom i pomfritom",
            priceRsd: 1490,
            // Fixture media is a public path; passes through menuStorageUrl.
            photoStorageId: "/dev-venue/2.jpg",
            pairings: [{ id: "p-hit-vino", pairedItemId: "i-prokupac" }],
          }),
        ],
      },
      {
        shape: "lista",
        base: { id: "g-pice", title: "Piće", iconKey: "sok" },
        items: [
          item("i-sljivovica", "Šljivovica", "rakija", {
            variants: [
              { id: "v-03", label: "0.3 l", priceRsd: 250 },
              { id: "v-05", label: "0.5 l", priceRsd: 390 },
            ],
            pairings: [{ id: "p-rakija-meze", pairedItemId: "i-meze" }],
          }),
          item("i-kafa", "Domaća kafa", "domaca kafa", { priceRsd: 180 }),
          item("i-pivo", "Točeno pivo", "pivo", { priceRsd: 320 }),
          item("i-voda", "Kisela voda", "voda", { priceRsd: 150 }),
          item("i-sok", "Cedjena pomorandža", "sok", {
            priceRsd: 380,
            available: false,
          }),
        ],
      },
      {
        shape: "galerija",
        base: { id: "g-jela", title: "Jela" },
        items: [
          item("i-cevapi", "Ćevapi 10 kom", "cevapi", {
            description: "U lepinji, sa lukom",
            priceRsd: 890,
            photoStorageId: "/dev-venue/3.jpg",
          }),
          item("i-meze", "Meze plata", "kajmak", {
            description: "Kajmak, ajvar, pršuta, sir",
            priceRsd: 1200,
          }),
          item("i-pljeskavica", "Pljeskavica", "pljeskavica", { priceRsd: 720 }),
          item("i-riba", "Pastrmka sa žara", "riba", { priceRsd: 1150 }),
        ],
      },
      {
        shape: "traka",
        base: { id: "g-dnevno", title: "Dnevna ponuda", daypartKey: "rucak" },
        items: [
          item("i-supa", "Teleća čorba", "corba", { priceRsd: 390 }),
          item("i-burek", "Burek sa sirom", "burek", { priceRsd: 320 }),
          item("i-salata", "Šopska salata", "salata", { priceRsd: 420 }),
        ],
      },
      {
        shape: "tabela_varijanti",
        base: { id: "g-vina", title: "Vina", daypartKey: "vecera" },
        items: [
          item("i-prokupac", "Prokupac", "vino", {
            variants: [
              { id: "v-casa", label: "čaša", priceRsd: 350 },
              { id: "v-flasa", label: "flaša", priceRsd: 1900 },
            ],
          }),
          item("i-tamjanika", "Tamjanika", "vino", {
            variants: [
              { id: "v-t-casa", label: "čaša", priceRsd: 390 },
              { id: "v-t-flasa", label: "flaša", priceRsd: 2200 },
            ],
          }),
          item("i-vermut", "Vermut", "vino", { priceRsd: 300 }),
        ],
      },
    ],
    dayparts: [
      { id: "d-dorucak", key: "dorucak", label: "Doručak", startMinute: 420, endMinute: 660 },
      { id: "d-rucak", key: "rucak", label: "Ručak", startMinute: 660, endMinute: 1020 },
      { id: "d-vecera", key: "vecera", label: "Večera", startMinute: 1020, endMinute: 1380 },
    ],
  };
}

export function fixtureView(options: { design?: MenuDesign | null } = {}): MenuPageView {
  return {
    businessName: "Kafana kod Mike",
    design: options.design === undefined ? DEFAULT_MENU_DESIGN : options.design,
    groups: fixtureModel().groups,
    // Fixture media uses public /dev-venue paths, which pass through the
    // resolver untouched — no signed URLs to map.
    blockImageUrls: {},
  };
}
