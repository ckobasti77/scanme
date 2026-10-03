# Preambula za agenta (nocni lanac i pojedinacni taskovi)

Ovo je obavezan deo SVAKOG taska. Procitaj ga i postuj doslovno.
```
--- KOMANDE KOJE RADIS SAM, NE OSTAVLJAS IH VLASNIKU ---
1. Radi u tekucem direktorijumu. NE pravi git worktree i ne ulazi ni u jedan.
   Prvo pokreni: git rev-parse --show-toplevel
2. BROWSER PROVERA. Vlasnik je ostavio "next dev" na http://localhost:3000 i
   PRIJAVLJEN JE KAO ADMIN. Koristi to: otvori stranice koje si napravio i
   proveri ih ocima, ne samo testovima. Sto si napravio a nisi video u browseru,
   nisi proverio. Ako ti treba podatak (npr. kartica ili lokal), napravi ga kroz
   admin, nemoj da izmisljas ID-jeve.
   VAZNO: Next.js 16 ODBIJA da digne drugi dev server iz istog direktorijuma,
   cak i na drugom portu. Zato harness:check (dize svoj na 3199) UVEK puca dok
   "next dev" radi na 3000. Redosled je obavezan:
     1) uradi browser proveru na localhost:3000 DOK server jos radi;
     2) tek onda ugasi ga: netstat -ano | findstr :3000  pa  taskkill /PID <pid> /F
     3) pokreni npm run check (harness sad moze da digne 3199);
     4) vrati server: start /B npm run dev
   Admin sesija je kolacic u browseru i prezivljava restart.
3. Ako stoji .git/index.lock a nijedan git proces ne radi, obrisi ga pre commita.
4. Na kraju MORA proci sve troje:
     npm run check
     npm run harness:namespace
     git diff --stat components/scanme-links lib/scanme-links*   -> MORA biti prazno
   harness:check mora dati 177x2 bajt-identicno. Ako pomeri makar bajt, STANI i
   upisi u docs/tasks/BLOCKED.md. NIKAD ne regenerisi goldene.
5. Kad je zeleno, commituj i gurni sam:
     git add -A
     git commit    (poruka MORA imati TELO sa izvestajem, ne samo naslov)
     git push aleksadjor3 feat/venue-memories
6. Sve sto trazi odluku vlasnika ide na kraj docs/tasks/BLOCKED.md sa brojem
   taska. NE pogadjaj. NE pisi "potvrdjeno s vlasnikom" ni bilo sta sto tvrdi
   njegovu saglasnost -- to je zabranjeno u AGENTS.md. Pisi "odlozeno, ceka
   odluku vlasnika".
7. NE DIRAS: convex/lib/access.ts, convex/lib/entitlements.ts, lib/flags.ts,
   nijedan fajl u components/scanme-links ni lib/scanme-links*.
   ORDERING_EXISTS i MENU_EXISTS ostaju netaknuti (terminalni taskovi).
8. Izvestaj na kraju: sta je uradjeno, sta je NAMERNO izostavljeno i zasto, sta
   sledeci task mora da pokupi za tobom, doslovan izlaz gejtova iz tacke 4, i
   KOJE SI STRANICE OTVORIO U BROWSERU i sta si na njima video. Ako neku nisi
   mogao da otvoris, reci zasto.
```
