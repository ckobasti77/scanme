# Prijava interesovanja i revizija ponude - 19. oktobar 2026.

Checkout: `scanme-amf-pasos`, postojeća grana `feature/amf-pasos-markice`. Nema deploy-a, izmena šeme, upisa u produkciju, promene QR odredišta, pokretanja/gašenja servera, commit-a ili push-a. Sačuvane prethodne izmene drugih agenata.

## Obrazac

Ruta ostaje `/sajam/auto-moto-fest-2026/prijava`.

- Svaki model ima svoj naziv i zaseban Starter/Napredni izbor. Nijedan paket nije unapred izabran.
- Upis prvog nepraznog znaka u poslednji red automatski prikazuje naredni prazan red, bez dugmeta i bez pomeranja fokusa. Brisanje teksta ne gomila prazne završne redove.
- Završni prazan red se ne šalje i nije obavezan. Upisani model mora imati paket; paket izabran uz prazan naziv zahteva naziv ili uklanjanje tog reda.
- Brisanje vozila ne pomera pakete na druge modele. Fokus ide na susedni model.
- Ovo je inicijalni prodajni upit. Nema kataloga, specifikacija, posebnog spiska brendova ili napomene. Kontakt: firma, ime, telefon; email je opcion.
- Postojeći `api.leads.create` već prihvata `offerSelection` kao string, pa ne treba novi endpoint/deploy. JSON sada glasi:

```json
{
  "source": "amf-2026-exhibitor-registration",
  "eventSlug": "auto-moto-fest-2026",
  "vehicles": [
    { "model": "TEST Model A", "package": "advanced" },
    { "model": "TEST Model B", "package": "starter" }
  ]
}
```

Više nema globalnog `package`, tekstualnog `vehicles`, `brand` ili `catalogUrl`. Interni primalac/renderer treba da čita paket iz svakog elementa `vehicles`. Postojeće čuvanje i email prosleđuju ceo JSON, bez gubitka tih podataka. Stare prijave ostaju neizmenjene. Ograničenje postojećeg endpointa od 10.000 znakova proverava se i pre slanja.

## Provere obrasca

- `npx tsc --noEmit --incremental false`: prolazi. `--incremental false` izbegava pisanje u deljeni `tsconfig.tsbuildinfo`.
- Ciljani ESLint: prolazi.
- `npx vitest run components/fair/exhibitor-registration.test.tsx convex/fairExhibitorRegistration.test.ts`: 5/5 testova. Novi strukturirani upit i stare prijave; pravi endpoint u memorijskoj test bazi, bez emaila/mreže, ponovni pokušaj ne duplira upit.
- `node components/fair/exhibitor-registration.browser.mjs`: prolazi na 360×640, 390×844, 430×932, 844×390, 1280×900. Stvarni React obrazac sa zamenjenim mrežnim adapterom; automatski redovi u StrictMode, fokus, uklanjanje, nezavisni paketi, prazan završni red, validacija, pending/error/retry/success. Nema runtime grešaka ili horizontalnog overflow-a.
- Stvarna lokalna ruta vizuelno pregledana na mobilnom i desktopu, bez slanja stvarnog upita. Snimci: `output/playwright/amf-registration/`.
- `npm run check` nije pokretan jer sadrži `next build`, zabranjen u deljenoj radnoj fascikli sa postojećim serverom. Nije pokretan drugi server niti standardni harness koji ga pokreće.

## PDF

Vlasnik je izabrao **telefon 3 - Svetli**. Novi pregled je zasebna kopija; original i prethodni pregled ostaju netaknuti:
`output/pdf/AMF-2026-Ponuda-izlagacima-REVIZIJA-2026-10-19.pdf`.

Izvor revizije: `scripts/fair/revise-amf-offer.py`. Osnovni prethodni generator nije menjan.

- Četiri telefona na prvoj strani; samo pregled svih pasoša. Novi svetli, fotorealistični okvir na svim ugrađenim ekranima; stvarni demo snimci bez skrolbara.
- Prvi korak stvarno pokazuje skeniranje nalepnice; drugi model + garažu, bez pasoša; treći zadržava izveštaj/anketu.
- Poslovni nazivi u report-snimcima uklonjeni pravom PDF redakcijom pre rasterizacije, uz novu ScanMe zelenu `#6fc05d`. Aktuelni vektorski logo umesto starog.
- Teodorin tekst prenet doslovno. Svetli paneli umesto crnih kod iskustva, Starter zaglavlja, popusta i kontakta.
- Uklonjen dodatni narandžasti red iz poređenja; funkcije i cene nisu samostalno menjane.
- QR kartice imaju izgled štampane nalepnice (zasečeni uglovi, fina ivica, ScanMe ispod), prave vektorske kodove i klikabilne površine. Uklonjen ispis sirovog `/r/` linka.
- Poslednja strana prati novi inicijalni upit, bez zahteva za slanje kataloga odmah i bez izmišljenih kontakt-podataka.

**Javno objavljivanje nije urađeno.** Read-only HEAD provera 19. oktobra: oba već dodeljena QR-a (`S08AJ7H2`, `KZ739G7D`) preusmeravaju na `https://www.scanme.rs/`; javni demo još vraća 404. PDF zato ostaje označen `RADNI PREGLED · NE SLATI`. Aktivacija destinacija / objavljivanje zahteva poseban produkcijski korak, ne samostalnu promenu kartica u ovom zadatku.
