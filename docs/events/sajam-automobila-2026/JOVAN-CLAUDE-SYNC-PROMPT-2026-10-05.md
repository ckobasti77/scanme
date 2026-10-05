# Prompt za Jovanov Claude — bezbedno preuzimanje i spajanje sajamskog rada

Kopirati Claude-u ceo sadržaj ispod.

---

Radiš u Jovanovom lokalnom ScanMe repozitorijumu. Cilj je da bez gubitka njegovog rada preuzmeš i, samo ako je potrebno, spojiš najnoviji zajednički rad sa grane:

- repozitorijum: `https://github.com/aleksadjor3/scanme.git`
- deljena grana: `codex/sajam-integracija-2026-10-04`
- očekivani Garage checkpoint u istoriji: `8e72c10`

Ne radi deploy, ne diraj `main`, ne force-pushuj, ne briši, ne resetuj, ne stashuj i ne odbacuj nijednu lokalnu izmenu.

## 1. Obavezni preflight

Prvo prikaži i sačuvaj u svom izveštaju:

```powershell
git status --short
git branch --show-current
git remote -v
git log --oneline --decorate -12
```

Utvrdi koji remote pokazuje na `aleksadjor3/scanme`. Ako nijedan ne pokazuje, dodaj ga kao `aleksa` bez menjanja postojećeg `origin` remote-a:

```powershell
git remote add aleksa https://github.com/aleksadjor3/scanme.git
```

Ako remote `aleksa` već postoji, proveri URL umesto ponovnog dodavanja. U nastavku koristi stvarni naziv tog remote-a.

## 2. Sačuvaj Jovanov lokalni rad pre preuzimanja

Ako je working tree dirty:

1. pregledaj svaki izmenjeni i novi fajl;
2. proveri da nema `.env`, tajni, dumpova, privatnih eksportova ili generisanih velikih fajlova;
3. napravi novu lokalnu safety granu sa trenutnog HEAD-a, npr. `jovan/safety-pre-sync-2026-10-05`;
4. commituj samo Jovanov nameran projektni rad jasnom WIP porukom.

Ne koristi stash/reset/checkout za uklanjanje izmena. Ako ne možeš da razdvojiš nameran rad od tajne ili artefakta, zaustavi se i pokaži Jovanu tačan spisak — ne nagađaj.

Zapamti naziv Jovanove izvorne grane i safety commit hash kao `JOVAN_SOURCE`.

## 3. Preuzmi deljenu granu

```powershell
git fetch <ALEKSA_REMOTE> codex/sajam-integracija-2026-10-04
```

Potvrdi da udaljena istorija sadrži `8e72c10`:

```powershell
git merge-base --is-ancestor 8e72c10 <ALEKSA_REMOTE>/codex/sajam-integracija-2026-10-04
```

Ako Jovan nema novije lokalne commitove koji nisu već na deljenoj grani, napravi ili ažuriraj lokalnu tracking granu isključivo fast-forward postupkom i završi sync bez merge commit-a.

Ako Jovan ima jedinstvene novije commitove:

1. ne spajaj direktno preko njegove radne grane;
2. napravi privremenu granu `codex/jovan-sync-2026-10-05` od `<ALEKSA_REMOTE>/codex/sajam-integracija-2026-10-04`;
3. prikaži razliku naredbom:

```powershell
git log --left-right --cherry-pick --oneline <ALEKSA_REMOTE>/codex/sajam-integracija-2026-10-04...JOVAN_SOURCE
```

4. prenesi samo stvarno jedinstvene Jovanove commitove, najstariji prvo; ne prenosi ekvivalentne B/M commitove koji su već u deljenoj istoriji;
5. kod konflikta uradi semantičko spajanje fajla — nikada masovno `--ours` ili `--theirs`.

## 4. Autoritet pri konfliktu

Na deljenoj grani zadrži kao autoritativno:

- `components/fair/garage/**`
- `app/sajam/garaza/**`
- `app/sajam/deli/**`
- `components/fair/model-actions-checkpoint.tsx`
- `components/fair/animated-model-disclosure.tsx`
- `lib/fair-client/**`
- `lib/fair-server/sharing*`
- `public/fair/**`
- `scripts/fair/check-garage.mjs`
- typed fair i18n tekstove.

Jovanove novije backend/map izmene prenesi samo ako su jedinstvene i ne krše ugovor. Za `convex/schema.ts`, validatore, `lib/fair-contract.ts`, rute i dokumentaciju obavezno uradi semantičko spajanje jer ih koriste oba rada.

Izvori istine, ovim redom:

1. `docs/events/sajam-automobila-2026/MASTER-KONTEKST.md`
2. `docs/events/sajam-automobila-2026/BACKEND-HANDOFF.md`
3. `docs/events/sajam-automobila-2026/FAIR-BACKEND-CONTRACT.md`
4. `docs/events/sajam-automobila-2026/JOVAN-DELTA-2026-10-05.md`
5. `docs/events/sajam-automobila-2026/STATUS-DASHBOARD.md`

Ne vraćaj stare ugovore: nema sponsored impression metrike, rating javno vraća samo lični unos, QR ide preko postojećeg `/r/[cardCode]`, a scan/direct/share/sponsored događaji ostaju strogo odvojeni.

## 5. Obavezna provera posle sync-a

```powershell
npm.cmd exec vitest run lib/fair-client/garage-store.test.ts lib/fair-server/sharing.test.ts convex/fairSharing.test.ts
node scripts/fair/check-model-checkpoints.mjs
node scripts/fair/check-garage.mjs
npm.cmd run check
git diff --check
git status --short
```

Ako browser harness prijavi postojeći Next dev server iz istog checkout-a, identifikuj PID i checkout, zaustavi samo taj potvrđeni proces, pokreni harness i zatim vrati dev server. Ne ubijaj nepoznate Node procese.

## 6. Share napomena

Automatizovani native-share stub prolazi, ali se sistemski share sheet nije otvorio na Aleksinom Samsung telefonu tokom pristupa preko LAN HTTP adrese. Ne proglašavaj Samsung kompatibilnost završenom. Ponovi ručni test preko HTTPS origin-a; očekivanje je direktan platformski share sheet, a WhatsApp/Viber/copy panel samo fallback.

## 7. Objavljivanje rezultata

- Ako si samo preuzeo deljenu granu bez jedinstvenih Jovanovih izmena, ništa novo ne pushuj.
- Ako si spojio jedinstvene Jovanove izmene i sve provere prolaze, prvo ponovo fetchuj udaljenu granu. Pushuj bez `--force` samo integracionu granu ili novu review granu ako nemaš pravo direktnog upisa.
- Nikada ne pushuj `main` i ne radi produkcijski/Convex deploy u ovom zadatku.

Na kraju izvesti Jovanu:

1. početnu granu i status;
2. safety commit, ako je napravljen;
3. remote/commit koji je preuzet;
4. prenete jedinstvene commitove;
5. svaki konflikt i kako je semantički rešen;
6. rezultate svih provera;
7. završni HEAD, branch i `git status --short`;
8. otvorene probleme bez prikrivanja.

---
