# FRONTEND-DELTA 2026-10-16 — Auto Moto Fest: pasoš sa markicama i topla tema

Grana `feature/amf-pasos-markice` (iz `main` `fa6656f`).

## Tema po događaju

- `lib/fair-theme.ts`: tabela `fairEventPresentation(slug)` → `{ themeClass, passportStyle }`.
  `elektromobilnost-2026` = plava tema + pasoš „unlock“ (nepromenjeno); `auto-moto-fest-2026` = topla tema + pasoš „stamps“.
  `fairEventThemeClass` radi kao i ranije.
- `app/sajam/fair-event.css`: `.fair-event--auto-moto` = akcenat `#e2602a`, podloga `#f4efe6`, list `#fbf8f2`, linija `#e4dccd`,
  `--fair-seal-ink`, papirna tekstura i zrno (`--fair-paper-tex`, `--fair-noise`). Za sve ostale događaje te promenljive su `none`.
- `components/fair/fair-paper-texture.tsx` (u `app/sajam/layout.tsx`) crta teksturu jednom, samo na AMF stranama.
- Ručno upisano `#f7f8f8` u `fair-garage.module.css` i `fair-passport.module.css` zamenjeno je sa `var(--fair-canvas)` (za elektromobilnost ista boja).

## Pasoš sa markicama

- `components/fair/passport/stamp-passport.tsx` (+ `.module.css`, `stamp-art.tsx`) zamenjuje `PassportDetail` kada je `passportStyle: "stamps"`.
  Rute, API i Convex su isti; favorit koristi postojeći `/api/fair/passport/favorite`.
- „Zalepljeno“ = postojeći seen-store `scanme:fair-passport-visits:v1`; dokument dobija aditivno polje `stuckAt` (datum na žigu).
  `markPassportModelsSeen(..., stuckAt?)`, novi `passportStuckAt(...)`.
- `fairHaptic(pattern, { iosTick: true })`: iOS fallback (skriveni `switch`), uključen samo u pasošu sa markicama.
- `NewStampCard`: za „stamps“ događaje tekst „Nova markica · Zalepi“.
- DEV panel pasoša (`?dev=1`): dugme „Vrati na početak“ (briše seen/stuckAt tog pasoša).

## Convex (samo interne setup funkcije, bez promene šeme)

- `fairSetup.bootstrapEvent` prima opcioni `eventCode`; podrazumevano je i dalje `elektromobilnost-2026`.
  Dodata AMF konfiguracija (Hala Čair, Niš, 30. 10. – 1. 11. 2026).
- DEV test intake: `docs/events/auto-moto-fest-2026/intake/dev-2026-10-16/` (AUDI_T: RS3_T, A3_T, Q4_T; `_T` = test, zameniti pre PROD-a).
