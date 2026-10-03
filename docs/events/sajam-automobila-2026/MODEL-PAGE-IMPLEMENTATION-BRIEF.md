# Model page vertical slice - implementation brief

> Status: **ODOBREN ZA IMPLEMENTACIJU, BEZ PRODUKCIJSKOG DEPLOYA**
>
> Poslednje ažuriranje: **2. oktobar 2026.**
>
> Vlasnik odluka: **Aleksa**
>
> Vizuelni izvor: [`MOCKUP-ROUND-1.md`](./MOCKUP-ROUND-1.md)
>
> UI/UX ugovor: [`EVENT-DESIGN-SYSTEM.md`](./EVENT-DESIGN-SYSTEM.md)
>
> Frontend plan: [`FRONTEND-INTEGRATION-PLAN.md`](./FRONTEND-INTEGRATION-PLAN.md)

Ovaj brief je izvršni ugovor za prvi javni model-page vertical slice. Ne menja poslovna pravila iz `MASTER-KONTEKST.md` niti backend vlasništvo iz `BACKEND-HANDOFF.md`. Kontradikcije se ne rešavaju pretpostavkom, već se vraćaju komandnom centru.

## 1. Cilj

Implementirati produkcijski kvalitet javne stranice modela i prihvaćene interakcije direktno pod `/sajam/...`, ali ih ne povezivati sa produkcijskim deployom dok Aleksa ne odobri stvarni browser rezultat i Jovanov backend ugovor ne bude dostupan.

## 2. Model i radni režim

- Model: `gpt-5.6-sol`.
- Effort: `high`.
- Mode: Default, ne Plan.
- Jedan coding agent poseduje zajednički event shell, tokene i ovaj vertical slice.
- Ne pokretati paralelne agente nad istim fajlovima.

## 3. Dozvoljeni opseg

Prvi slice obuhvata:

- event shell i centralni `--fair-*` token sloj;
- pravu model rutu `/sajam/[eventSlug]/model/[modelSlug]`;
- zasebnu rutu Glasa publike;
- V5 prvi ekran sa opcionom fotografijom, identitetom, cenom i četiri ključne specifikacije;
- inline `Sve specifikacije i opis` disclosure;
- localStorage dodavanje/uklanjanje iz Garaže kroz postojeći fair garage core;
- Starter overall i Advanced trodimenzionalni rating sheet;
- vizuelne bottom-sheet forme `Zainteresovan sam` i `Probna vožnja`, bez pravog slanja;
- Free/Starter/Advanced fixture režime;
- fixture stanja sa/bez fotografije, ispod/iznad vote praga, uspeh/greška, jedno/pet pitanja;
- diskretan `dev` ulaz pored `Powered by ScanMe` isključivo pri dnu stranice.

Ne obuhvata:

- Convex, fair ugovor, entitlements, API gateway, resolver ili PII;
- produkcijsku mapu;
- anketu, pasoš, poređenje, kompletnu Garažu ili sponzorisane rotacije;
- pravi lead submit ili lažnu success potvrdu;
- push, deploy ili javno dodavanje ruta u navigaciju.

## 4. Obavezne granice

- Ne menjati `convex/**`, `app/r/[cardCode]/**`, `lib/fair-contract.ts`, `lib/fair-entitlements.ts` niti `app/api/fair/**`.
- Dok Jovanov ugovor nije dostupan, podaci dolaze kroz tipizirani frontend fixture adapter, ne kroz tipove koji glume budući backend autoritet.
- Sve nove javne stringove dodati kroz typed `lib/i18n` sloj.
- Server Components su podrazumevani; client granice moraju ostati male.
- Sve `/sajam/**` stranice su `noindex`, samo svetla tema i bez globalnog theme toggle/text-reveal ponašanja.
- Ne koristiti ScanMe zelenu, mono body font, scan linije, neon, radijalne gradijente ili dominantno staklo.
- Ne zaključivati package prava u klijentu. Fixture adapter eksplicitno daje capabilities.

## 5. Vizuelni ugovor

- Pravac: `Topli showroom V5`.
- Početni font: `Archivo Variable`.
- Paleta se uzorkuje iz V5 i centralizuje u `--fair-*` tokene; nijedna feature komponenta nema sopstvenu proizvoljnu paletu.
- Header je kompaktan: Sajam automobila, `Auto Moto Fest`, `Mapa`, `Garaža`.
- Broj modela u Garaži je vizuelno nedvosmislen badge uz ikonicu.
- ScanMe nije veliki element prvog ekrana; diskretan `Powered by ScanMe` je pri dnu.
- Logo, naziv i cena mogu da preklapaju fotografiju. Podržati levo, desno i dole presentation poravnanje.
- Bez fotografije prikazati završenu tonalnu površinu sa identitetom, bez generičke slike automobila.
- Sve dostupne primarne akcije treba da stanu u prvi viewport na 375 x 667 bez narušavanja čitljivosti većine modernih telefona.
- Free/Starter/Advanced nedostupne akcije se skrivaju, ne prikazuju kao disabled prodajni teaser.
- `Sačuvaj u garažu` je sticky; skriva se kada full-screen tok ili bottom sheet preuzme fokus.

## 6. Glas publike

- Jedno pitanje po ekranu, tap meta je ceo odgovor.
- Jedan tap bira i šalje glas; nema submit koraka.
- Pressed/selected feedback je trenutan. Ne tvrditi da je glas sačuvan dok server/fixture adapter ne vrati uspeh.
- Ispod pet glasova nema javnih procenata: prikazati lični izbor i diskretno `Rezultati uskoro`.
- Iznad praga svi odgovori prelaze u result stanje.
- Pozadina celog odgovora puni se sleva nadesno do procenta; nema zasebnog progress bara niti checkmarka.
- Samo izabrani odgovor dobija tanak border i snažniji tonalitet.
- GSAP timeline sinhronizuje ispunu i rast celobrojnog procenta oko 750 ms, sa brzim početkom i kontrolisanim ramp-down završetkom.
- Promena glasa animira prelaz sa starih na nove procente.
- Ručno `Sledeće pitanje`; poslednje pitanje nudi `Nazad na model`.
- Povratak na odgovoreno pitanje prikazuje sačuvano result stanje i dozvoljava promenu.
- Greška ostavlja pošten inline retry bez lažne potvrde.
- Reduced motion odmah prikazuje krajnje stanje.

## 7. Ocene i ostale interakcije

- Starter: jedna ukupna ocena i jedno `Sačuvaj ocenu`.
- Advanced: tri opcione ocene `Izgled`, `Specifikacije`, `Cena` i jedno `Sačuvaj ocene`.
- Nema javnog proseka, broja ocena niti objašnjavajućeg privacy/analytics pasusa.
- Akcione ikonice koriste zajedničku veličinu, stroke i grafitno-terakota sistem.
- Bottom sheet koristi X, browser back i backdrop zatvaranje; nema drag-to-dismiss u prvom slice-u.
- Garaža: dugme se elegantno preoblikuje u `Sačuvano`, a badge u headeru dobija diskretan scale feedback. Bez leteće fotografije.
- Bez zvuka i vibracije.

## 8. Implementacioni checkpointovi

1. F0 shell, tokeni, typed i18n, ruta i fixture adapter.
2. Model prvi ekran i browser screenshot na 375 x 667, 390 x 844 i 412 x 915.
3. Glas publike i sva result/threshold/error/multi-question stanja.
4. Rating, local garage i vizuelni lead sheetovi.
5. Keyboard, screen reader, reduced-motion, refresh i overflow provera.
6. `npm.cmd run check` i stvarni browser pregled pre prijave završetka.

Ne nastavljati na sledeći veliki checkpoint ako prethodni ima očigledan vizuelni problem. Ne commitovati, pushovati niti deployovati bez eksplicitnog zahteva.

## 9. Kriterijumi prihvatanja

- Nema horizontalnog overflowa na ciljnim mobilnim viewportovima.
- Primarne funkcije su odmah uočljive, ali model i cena ostaju jasna prva informacija.
- Badge Garaže se ne može protumačiti kao naziv druge garaže ili događaja.
- Sve tap mete su najmanje 44 px.
- Fotografija može potpuno da nestane bez rupe u rasporedu.
- Glas publike subjektivno reaguje odmah i nikada ne prikazuje izmišljene rezultate.
- Animacija izgleda savremeno i precizno, bez dekorativnog viška.
- Sticky elementi ne prekrivaju sadržaj ni safe-area.
- DEV kontrola ne utiče na normalno vizuelno iskustvo stranice.
- Postojeće korisničke izmene i prljav worktree ostaju sačuvani.
