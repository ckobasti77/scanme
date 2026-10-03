import type { OrderingAdminDict } from "../types";

export const orderingAdminSr = {
  cardHeading: "Poručivanje i konobar",
  cardDescription: "Konfiguracija stolnog poručivanja i upravljanje stavkama.",
  lockedHeading: "Poručivanje je Premium opcija",
  lockedNote:
    "Ova sposobnost je dostupna u Premium paketu usluge lokala. Nadogradite paket kako biste omogućili poziv konobara i poručivanje sa stola.",
  enabledLabel: "Omogući poručivanje",
  enabledDescription:
    "Kada je uključeno, gosti mogu da biraju stavke i šalju porudžbine konobaru.",
  callWaiterLabel: "Dugme za poziv konobara",
  callWaiterDescription:
    "Prikaži dugme 'Pozovi konobara' na stranici poručivanja za brzu asistenciju.",
  codeLabel: "Kod lokala za poručivanje",
  codeDescription:
    "Gosti pristupaju poručivanju preko skeniranja kartice stola ili direktnog koda.",
  copyLink: "Kopiraj link",
  linkCopied: "Link je kopiran u privremenu memoriju.",
  itemsHeading: "Lista stavki za poručivanje",
  itemsDescription:
    "Kratka lista stavki koje gosti mogu poručiti direktno sa stola.",
  emptyItems: "Još uvek nema unetih stavki. Dodajte prvu stavku.",
  addItemAction: "Dodaj stavku",
  editItemAction: "Izmeni",
  deleteItemAction: "Obriši",
  itemNameLabel: "Naziv stavke",
  itemNamePlaceholder: "npr. Domaća kafa, Kisela voda 0.7l...",
  itemPriceLabel: "Cena (RSD, opciono)",
  itemPricePlaceholder: "npr. 250",
  itemPriceNote:
    "Cene su isključivo informativnog karaktera i nigde se ne sabiraju u aplikaciji (e-fiskalizacija).",
  availableLabel: "Dostupno",
  unavailableLabel: "Nema više",
  toggleAvailableSuccess: "Dostupnost stavke '{name}' je promenjena.",
  saveAction: "Sačuvaj",
  cancelAction: "Otkaži",
  dialogAddTitle: "Nova stavka za poručivanje",
  dialogEditTitle: "Izmena stavke",
  confirmDeleteTitle: "Da li ste sigurni da želite da obrišete stavku?",
  confirmDeleteDescription: "Ova akcija je nepovratna.",
  errorNotEntitled: "Poručivanje nije omogućeno za ovaj paket usluge.",
  itemNotFound: "Stavka nije pronađena.",
  itemNameRequired: "Naziv stavke je obavezan.",
  configSaveSuccess: "Podešavanja poručivanja su sačuvana.",
  configSaveError: "Greška pri čuvanju podešavanja.",
  itemAvailabilityError: "Greška pri promeni dostupnosti.",
  itemSaveSuccess: "Stavka je uspešno sačuvana.",
  itemSaveError: "Greška pri čuvanju stavke.",
  itemDeleteSuccess: "Stavka je obrisana.",
  itemDeleteError: "Greška pri brisanju stavke.",
} as const satisfies OrderingAdminDict;
