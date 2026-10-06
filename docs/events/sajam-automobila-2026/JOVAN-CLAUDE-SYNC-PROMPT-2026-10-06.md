# Prompt za Jovanov Claude — zajednički checkpoint 6. oktobar 2026.

Kopiraj Claude-u sve ispod ove linije.

---

Radiš u Jovanovom lokalnom ScanMe repozitorijumu. Cilj ovog zadatka je samo bezbedna Git sinhronizacija sa zajedničkom sajamskom granom. Ne implementiraj novu funkcionalnost, ne radi deploy, ne menjaj produkcione podatke i ne diraj `main`.

## Autoritativni izvor

- repozitorijum: `https://github.com/aleksadjor3/scanme.git`
- zajednička grana: `codex/sajam-integracija-2026-10-04`
- obavezni QR kodni checkpoint u istoriji: `c37bd0e`
- Garage checkpoint koji mora ostati u istoriji: `8e72c10`

Checkpoint `c37bd0e` sadrži Aleksin frontend, Garažu, Jovanov već preneti B0–B7 backend/mapu i sinhronizovan produkcijski QR inventar. Nemoj ponovo prenositi Jovanove B0–B7 commitove samo zato što na njegovom repozitorijumu imaju druge hash-eve.

## Zabrane

- Bez `reset --hard`, force-pusha, brisanja ili odbacivanja postojećih izmena.
- Bez stasha kao prečice za nerazjašnjen dirty worktree.
- Bez masovnog `ours`/`theirs` rešavanja konflikata.
- Bez Convex ili Vercel deploy-a.
- Bez menjanja produkcionih env vrednosti i podataka.

## 1. Preflight

Prvo prikaži:

```powershell
git status --short
git branch --show-current
git remote -v
git log --oneline --decorate -15
```

Nađi remote koji pokazuje na `aleksadjor3/scanme`. Ako ne postoji, dodaj ga bez menjanja postojećeg `origin` remote-a:

```powershell
git remote add aleksa https://github.com/aleksadjor3/scanme.git
```

U nastavku koristi stvarni naziv tog remote-a umesto `<ALEKSA_REMOTE>`.

## 2. Sačuvaj jedinstveni lokalni rad

Ako je working tree dirty, pregledaj izmene i napravi safety granu sa trenutnog HEAD-a, na primer `jovan/safety-pre-sync-2026-10-06`. Commituj samo Jovanov nameran projektni rad. Ne commituj `.env`, tajne, dumpove, PII, generisane build foldere ili privatne eksporte.

Ako ne možeš bezbedno da razdvojiš nameran rad od artefakata, zaustavi se i Jovanu pokaži tačan spisak problematičnih fajlova.

## 3. Preuzmi zajedničku granu

```powershell
git fetch <ALEKSA_REMOTE> codex/sajam-integracija-2026-10-04
git merge-base --is-ancestor c37bd0e <ALEKSA_REMOTE>/codex/sajam-integracija-2026-10-04
git merge-base --is-ancestor 8e72c10 <ALEKSA_REMOTE>/codex/sajam-integracija-2026-10-04
```

Obe provere moraju vratiti exit code `0`.

Ako Jovan nema jedinstvene nove commitove posle svog poslednjeg backend rada, napravi lokalnu tracking granu bez merge commit-a:

```powershell
git switch -c jovan/sajam-zajednicki-2026-10-06 --track <ALEKSA_REMOTE>/codex/sajam-integracija-2026-10-04
```

Ako ta lokalna grana već postoji, prebaci se na nju i dozvoli samo fast-forward ažuriranje:

```powershell
git switch jovan/sajam-zajednicki-2026-10-06
git merge --ff-only <ALEKSA_REMOTE>/codex/sajam-integracija-2026-10-04
```

## 4. Ako Jovan zaista ima novije jedinstvene commitove

Prvo pokaži razliku:

```powershell
git log --left-right --cherry-pick --oneline <ALEKSA_REMOTE>/codex/sajam-integracija-2026-10-04...<JOVAN_SOURCE>
```

Commitovi B0–B7 sa Jovanove stare `sajam-backend-2026` grane već postoje na zajedničkoj grani pod drugim hash-evima. Ne cherry-pickuj ih ponovo. Prenesi samo commit napravljen posle tog rada koji sadrži novu, do sada neintegrisanu funkcionalnost.

Za stvarno jedinstven rad napravi review granu od zajedničkog checkpointa:

```powershell
git switch -c jovan/sajam-sync-review-2026-10-06 <ALEKSA_REMOTE>/codex/sajam-integracija-2026-10-04
```

Zatim prenesi samo jedinstvene commitove, najstariji prvo. Kod konflikta uradi semantičko spajanje. Ne pushuj preko zajedničke grane dok sve provere ne prođu.

## 5. Izvori istine

Pročitaj ovim redom:

1. `docs/events/sajam-automobila-2026/MASTER-KONTEKST.md`
2. `docs/events/sajam-automobila-2026/BACKEND-HANDOFF.md`
3. `docs/events/sajam-automobila-2026/FAIR-BACKEND-CONTRACT.md`
4. `docs/events/sajam-automobila-2026/JOVAN-DELTA-2026-10-05.md`
5. `docs/events/sajam-automobila-2026/STATUS-DASHBOARD.md`

Kod je dokaz implementacije, ali ne sme tiho menjati zaključani proizvodni ugovor.

## 6. Obavezna provera

```powershell
npm.cmd exec vitest run lib/fair-client/garage-store.test.ts lib/fair-server/sharing.test.ts convex/fairSharing.test.ts convex/fairAdmin.test.ts
node scripts/fair/check-model-checkpoints.mjs
node scripts/fair/check-garage.mjs
npm.cmd run check
git diff --check
git status --short
```

Ako browser harness naiđe na postojeći Next proces, identifikuj njegov PID i checkout. Zaustavi samo potvrđeni proces iz ovog checkout-a, pokreni proveru i potom vrati server ako je bio potreban Jovanu.

## 7. Očekivani rezultat

Na kraju Jovanu napiši:

1. početnu granu i status;
2. safety granu/commit, ako su bili potrebni;
3. da li su `c37bd0e` i `8e72c10` potvrđeni;
4. da li je bilo stvarno jedinstvenih Jovanovih commitova;
5. svaki konflikt i način rešavanja;
6. rezultate svih provera;
7. završni branch, HEAD i `git status --short`;
8. otvorene probleme.

Ako nema jedinstvenog novog Jovanovog rada, ne pravi bespotreban merge commit i ne pushuj ništa — samo ostavi Jovanu čistu lokalnu tracking granu na zajedničkom checkpointu.

---
