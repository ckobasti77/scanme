# FRONTEND-DELTA 2026-10-20 — Produkcijska objava AMF demo aplikacije, obrasca za prijavu i QR kodova

Grana `fix/prelaunch-landing` spojena sa `feature/amf-pasos-markice` i objavljena na `origin/main` i produkcijski Convex (`adamant-warbler-746`).

## Šta je objavljeno i povezano

- **Landing page (`https://www.scanme.rs/`)**: objavljene sve prelaunch ispravke (čitljiv tekst proizvoda, centrirane nalepnice, kontakt forma sa višestrukim izborom usluga, kartice usluga i hero u prvom ekranu).
- **AMF demo aplikacija (`https://www.scanme.rs/sajam/demo-auto-moto-fest-2026/mapa`)**: javno dostupne rute `/mapa`, `/pasosi`, `/garaza` i `/sajam/demo-auto-moto-fest-2026` (model), sa izolovanim lokalnim akcijama bez upisa u produkcijsku bazu.
- **Obrazac za prijavu izlagača (`https://www.scanme.rs/sajam/auto-moto-fest-2026/prijava`)**: javno dostupan obrazac povezan na `api.leads.create`.
- **Formatiranje mejla za prijavu izlagača (`convex/leadEmails.ts`, `lib/i18n/sr/lead-email.ts`, `components/fair/exhibitor-registration-model.ts`)**:
  - Za prijave sa `source: "amf-2026-exhibitor-registration"`, mejl koji stiže na `office@scanme.rs` ima jasan naslov `Prijava izlagača · AMF 2026 — {business} ({count})`, strukturiran pregled kontakt podataka, zbir po paketima (`Napredni` / `Starter`) i preglednu HTML/tekstualnu tabelu svih prijavljenih vozila sa paketima i cenama.
  - Polje `message` u `leads` tabeli takođe čuva čitljiv pregled vozila po stavkama.
- **Dinamični QR kodovi iz PDF ponude (produkcija `adamant-warbler-746`)**:
  - `S08AJ7H2` (`nn7ds4p31z8pkys1j2z53zzz318gh7yt`) preusmeren na `https://www.scanme.rs/sajam/demo-auto-moto-fest-2026/mapa` (HTTP 302, `no-store`).
  - `KZ739G7D` (`nn7enckx11w6sr4vhb1dpnat8n8ghvv5`) preusmeren na `https://www.scanme.rs/sajam/auto-moto-fest-2026/prijava` (HTTP 302, `no-store`).

## Hotfix `hotfix/map-ios` — mapa na iPhone-u i Mercedes link

- **Oznake na AMF mapi (`components/fair/map/amf-topographic-canvas.tsx`)**: logotipi, nazivi, kvačice završenog pasoša i natpis „Ulaz” više nisu `<foreignObject>` u SVG-u (iOS Safari ih nije iscrtavao), nego HTML sloj `[data-amf-labels]` u istom pomerljivom sloju. Svaka oznaka je `[data-label="<key>"]` (isti okvir kao ranije `brandFrame`), sadržaj je i dalje `[data-mark="<key>"]`; SVG `<g data-brand>` zadržava naslov, fokus i prsten izbora.
- **Logotipi**: jednobojni izgled (grayscale + contrast + multiply) „pečen” u `components/fair/map/brand-assets/map/*.png` skriptom `scripts/fair/bake-map-logos.mjs`; nema `mix-blend-mode` ni filtera na oznakama. `amfEntranceLogoCrops` je uklonjen (isečci su u PNG-ovima), dodat `amfEntranceCroppedLogos`.
- **Prsten izbora** obuhvata vidljivi logo i tekst, ne ceo okvir štanda. „Lukač” 38px (staje u štand).
- **Mercedes-Benz sajt** (`lib/fair-map/websites.ts`): `https://mercedes-benz-kemoimpexauto.rs` (stari dubinski link organizatora vraća 404). U Convex-u (DEV i PROD) nijedan `accounts.websiteUrl` ne postoji, pa izmena podataka nije potrebna.
