# Integracija Aleksa + Jovan — 10. oktobar 2026.

Aleksa je tražio proveru i produkcijski deploy, uz očuvanje njegovog kadriranja fotografija.

- Spojeno `origin/codex/jovan-sajam-super-2026-10-09` (`2642292`) sa 24 lokalne aplikacione/dokumentacione izmene iz `scanme-sajam-integracija`.
- Četiri konflikta razrešena tako da `fairVehiclePhotoStyle` i svi postojeći fokusi ostanu. Garaža, poređenje i deljena kolekcija koriste i Jovanov `fairPhotoUnoptimized`; rotacija koristi njegovu novu strukturu i animaciju sa Aleksinim fokusom fotografije.
- `lib/fair-client/vehicle-photo.ts` prenet bez izmene.
- Produkcija proverena isključivo čitanjem: pet aktivnih učešća i pet aktivnih štandova; JMEV 9, Grand Motors i AUTO MIG 6, Ferum 1A, BENTU 1B. Nema drugih učešća, uključujući ScanMe i Enigma IT.
- Zato `FAIR_PUBLIC_MAP_ENABLED` ostaje `false`, u skladu sa Jovanovim PROD uputstvom kada podaci nisu spremni. Javne adrese i ulazni pano nastavljaju da vode u garažu. Mapa i „Gde je gužva“ ostaju u kodu za kasnije uključivanje.
- Testovi javnih putanja proveravaju oba stanja prekidača, umesto da zahtevaju da produkcijska mapa uvek bude uključena.
- Nema izmene šeme ili novih env promenljivih. Nema uvoza, povlačenja ili brisanja produkcijskih izlagača u ovom zadatku.
- Originalni radni folder i stariji worktree-ji ostaju sačuvani. Spoj je u `scanme-production-2026-10-10`, na grani `codex/sajam-production-2026-10-10`.

Rezultati završnih provera i deploy-a beleže se u lokalnom izveštaju `reports/spajanje-2026-10-10/`.
