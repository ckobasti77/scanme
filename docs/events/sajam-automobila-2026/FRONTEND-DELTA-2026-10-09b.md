# FRONTEND DELTA — 2026-10-09b

Uske vizuelne izmene za `/sajam/elektromobilnost-2026`, na release grani.

- Favicon koristi originalnih šest vektorskih ScanMe tačaka; PNG je rezervna verzija.
- Naziv modela smanjuje font prema najdužoj reči, bez preloma unutar reči.
- Fotografije popunjavaju okvir (`cover`), bez praznih/crnih traka; zajednički fokus po fotografiji važi na modelu, u garaži, poređenju, pasošu, deljenju i rotaciji. Hero je 16:10, kartice modela u pasošu 16:9 da ne seku vozilo.
- Specifikacije se otvaraju i zatvaraju istom animacijom od 0,5 s; reduced-motion je poštovan.
- Mobilni Starter/Advanced imaju niži hero i zbijenije ključne podatke. Dugme za garažu ostaje u toku stranice i ne prekriva druge akcije; dodirne površine ostaju najmanje 44 px.
- Admin saglasnosti nudi skraćeni predlog sa postojećim `{izlagac}` placeholderom. **Aktivni tekst nije promenjen.** Za interest i test_drive treba sačuvati novu verziju i aktivirati je uz postojeći stvarni zapis pravne provere. Prikazani tekst i sačuvani consent snapshot i dalje određuje ista aktivna verzija na serveru.
- Potvrda za „Zainteresovan sam” izbačena iz zadatka: vlasnik je potvrdio da automatsko slanje radi.

Nema promene backend ugovora, Convex podataka, QR resolvera ni ScanMe Links-a. Nema produkcionog deploy-a niti merge-a Jovanove grane.

Admin DEV alati zadržavaju postojeću server-side proveru admin naloga i rade na lokalu i u produkcionom buildu. U postojećem admin panelu `Dodaj sve modele sajma` zamenjuje ograničenje na pet modela: koristi sve objavljene modele iz admin state-a, čita fotografije/cene preko postojećeg javnog garage-models endpointa i dopunjava samo lokalnu garažu tog pregledača. Ne briše modele/bedževe, ne duplira modele pod ranijim event ključem i ne prikazuje uspeh kada storage upis ne uspe. Nema nove Convex funkcije niti promene admin ovlašćenja. Telefon mora biti prijavljen na istoj lokalnoj adresi u DEV admin nalog; produkciona i localhost sesija se ne prenose na LAN IP adresu.

Za lokalni HTTP pregled sa telefona ispravljena je samo instalirana kopija `@convex-dev/auth` 0.0.94 (`node_modules/.../dist/server/utils.js` i odgovarajući `src/server/utils.ts`): privatne IPv4 adrese sa portom tretira kao lokalne isključivo kada je `NODE_ENV=development`, kako browser ne bi odbacio auth kolačić označen `Secure` na HTTP LAN adresi. Provereno: DEV privatne adrese prolaze, javne adrese i maskirani domeni ne; u produkciji privatna adresa opet dobija originalno Secure ponašanje. **Ova lokalna ispravka ne commit-uje se i nestaje pri ponovnoj instalaciji paketa.** HTTP poreklo modela u `next dev` prepoznaje i LAN adresu.

Zasebni `tsc --noEmit` prijavljuje greške u neizmenjenim test fajlovima (adminFinance/adminOperational/adminProducts/adminV1, billing, memories); Next proverava aplikacioni kod, ali izostavlja `.test.*` dijagnostiku. Te greške nisu rešavane u ovom vizuelnom scope-u i nije tačno tvrditi da samostalni `tsc` prolazi. Ciljani testovi garaže/admin-dev: 18/18. Produkcioni backend nije korišćen niti menjan.

Posle konačne izmene u postojećem admin panelu ponovo prolazi `npm run check` u celosti: lint (2 postojeća upozorenja), production build sa aplikacionom proverom tipova, namespace i 177×2 golden prikaza. Lokalni server vraćen na :3000. Prijavljeni admin panel na telefonu zahteva vlasnikovu DEV prijavu; u agentskom browseru nije postojala admin sesija, pa nema tvrdnje da je novi admin klik ručno potvrđen pod njegovim nalogom.

Naknadno: JMEV pasoš koristi dostavljenu fotografiju `jmev-showroom-emblem.jpg`, sa logotipom na fasadi. Promenjena je samo putanja fotografije. Na mobilnom prikazu 390×844 zaglavlje je pre i posle 356×126 px, a sve tri kartice su pre i posle visoke 200,25 px. Screenshotovi svih izmena i svih 15 modela nalaze se u lokalnom `output/mobile-review-2026-10-09/` (ne commitovati).

Posle zamene fotografije `npm run check` ponovo prolazi u celosti (lint, build, namespace i 177 × 2 golden prikaza). Privremeni screenshot preview uklonjen pre build-a; tri privremeno sačuvana modela uklonjena iz lokalne garaže nakon snimanja.

Provere: 72 test fajla / 668 testova (sajam + redirects) prolaze. Lint, build i namespace provera prolaze; dva postojeća lint upozorenja van ovog scope-a. `harness:check` prolazi: 177 slučajeva × 2 prikaza identični golden rezultatima. Poslednji korak `npm run check` ponovljen zasebno nakon konflikta sa ponovo pokrenutim :3000 serverom i instalacije nedostajućeg Playwright headless runtime-a. Mobilni prikaz ručno proveren na 320×568, 375×667 i 390×844, uključujući lokalni privremeni prikaz JMEV-a sa svim Advanced akcijama (uklonjen pre build-a, bez menjanja podataka).
