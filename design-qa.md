# Design QA

## Source

- Reference: `C:\Users\user\AppData\Local\Temp\codex-clipboard-f797d48b-1cc1-42f0-b1f2-25bb56957cc2.png`
- Implementation: `C:\My Stuff\Posao\ScanMe\Site\scanme\output\footer-desktop-dark-1440.png`
- Additional responsive captures:
  - `C:\My Stuff\Posao\ScanMe\Site\scanme\output\footer-desktop-1440.png`
  - `C:\My Stuff\Posao\ScanMe\Site\scanme\output\footer-mobile-375-top.png`
  - `C:\My Stuff\Posao\ScanMe\Site\scanme\output\footer-mobile-375-contact.png`

## Target

- Page: `http://localhost:3000/#kontakt`
- Desktop viewport: 1440 x 900
- Mobile viewport: 375 x 812
- States: light theme, dark theme, mobile stacked layout

## Comparison history

1. Recreated the reference hierarchy as four content groups with a closing copyright row.
2. Adapted the reference to the current ScanMe system: existing wordmark, IBM Plex Mono, semantic theme tokens, 1440 px container, sharp section geometry, lime status text and existing CTA styling.
3. Replaced placeholder contact states with the requested phone and email. Marked every planned product as `Uskoro`, while `ScanMe Review` is marked `Dostupno`.
4. Compared the source and dark desktop implementation together. The information hierarchy, column balance and divider rhythm match the reference while remaining visually continuous with the live site.
5. Verified 1440 x 900 and 375 x 812 with no horizontal overflow. All internal footer targets exist, phone and email schemes are correct, and the browser console has no warnings or errors.

## Final result

passed
