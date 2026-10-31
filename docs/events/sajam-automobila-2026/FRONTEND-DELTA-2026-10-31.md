# FRONTEND-DELTA 2026-10-31 — srce favorita u pasošu, brži prelaz Mapa/Pasoši/Garaža

Backend (`convex/`), validatori, šema, `mapLocationId` i API rute **nisu menjani**.

## Pasoš (Auto Moto Fest, `stamp-passport.tsx`)

- Ceo red modela je link na `/sajam/{event}/model/{slug}` (i za neskenirane modele).
- Favorit se bira srcem u gornjem desnom uglu markice (44 × 44 px), na svakom redu.
  Pravilo je isto kao ranije: srce radi tek kad je pasoš kompletan i zapečaćen;
  pre toga je `aria-disabled` i dodir prikaže objašnjenje.
- Čuvanje: `lib/fair-client/favorite-sync.ts` — srce se menja odmah, zahtevi idu
  sa debounce 300 ms, najviše jedan u letu, uvek redom dodira; pobeđuje poslednji
  dodir; neuspeh vraća poslednji potvrđeni izbor. `POST /api/fair/passport/favorite`
  je isti; brzo menjanje ne troši više od jednog zahteva po pauzi, pa ne udara u
  `fairBrandFavorite` limit (5 odjednom, 10/min).
- Pasoš u stilu "unlock" (Elektromobilnost, `FavoritePicker`) nije menjan.

## Navigacija

- Stranice su premeštene u route grupe bez promene URL-a:
  `app/sajam/[eventSlug]/(mapa)/page.tsx`, `pasosi/(lista)/page.tsx`,
  `garaza/(pregled)/page.tsx`, svaka sa svojim `loading.tsx` (shell sa aktivnim
  tabom + skeleton). Model, deli i `pasosi/[brandSlug]` nemaju taj loading.
- Tri linka u shell-u sada imaju podrazumevani prefetch (samo do `loading.tsx`,
  bez Convex upita); serverske stranice ostaju `force-dynamic`, podaci sveži.
