// Zastavice proizvoda (RFC-002 §2.6, §2.0 constraint 7).
//
// TASK-61 (terminalni flip): Meni je sada pun proizvod — `scanme_menu` je u
// `serviceTypeValidator`, editor i javna stranica rade, admin podstranica se
// aktivira. Ova zastavica preimenuje admin oznaku „ScanMe Page" → „Meni" i
// uključuje Meni podstranicu po lokalu (components/admin/location-admin.tsx,
// admin-shell.tsx).
//
export const MENU_EXISTS = true;

// TASK-71 (terminalni flip): poručivanje je sada pun proizvod. Za razliku od
// MENU_EXISTS, ovo nije stvarna grana koda — `table_ordering` (cardTargetKind
// + splitter item), owner-ova kartica za konfiguraciju u klijentskom panelu
// (components/client-panel/venue-ordering-card.tsx) i gostova/panel stranice
// (/o/[code], /panel/[venueCode]) su već bili neuslovno živi od TASK-63/64
// nadalje — nijedno mesto u kodu ne čita ovu zastavicu. Ona je dokumentovani
// znak da je RFC-004 završen, tačno kao terminalni marker.
export const ORDERING_EXISTS = true;
