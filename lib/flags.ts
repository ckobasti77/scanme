// Zastavice proizvoda (RFC-002 §2.6, §2.0 constraint 7).
//
// Meni je prvorazredna usluga u cenovnom modelu, ali još NE postoji kao
// proizvod: nema `scanme_menu` u `serviceTypeValidator` (convex/schema.ts), nema
// stranice ni editora, i u prodajnom toku (`/kupovina`, `/ponuda`) stoji na
// „USKORO". Ovaj task NE pravi Meni proizvod — pravi samo JEDNU kuku za
// preimenovanje, tako da je kasnije uključivanje jedan prekidač.
//
// Dok je `false`:
//   • admin oznaka „ScanMe Page" ostaje „ScanMe Page" (ne „Meni");
//   • Meni podstranica po lokalu se ne prikazuje (a i onako ne bi bila `active`
//     jer nema `scanme_menu` profila).
//
// Kad Meni bude proizvod, potrebno je i:
//   1. flipnuti `MENU_EXISTS` na `true`;
//   2. dodati `scanme_menu` u `serviceTypeValidator` (convex/schema.ts).
export const MENU_EXISTS = false;
