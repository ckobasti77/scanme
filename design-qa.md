# Design QA — ScanMe Links editor

## Evidence

- Source visual truth: `C:\My Stuff\Posao\ScanMe\Materijali\Design Ref\ScanMe Links (UI)\Codex Mockups\call_IsEQ4NdcG0YWrBC97dBkh6U5.png`
- Browser-rendered implementation: `C:\My Stuff\Posao\ScanMe\Site\scanme\output\scanme-links-editor-qa-1920x940.png`
- Focused tooltip state: `C:\My Stuff\Posao\ScanMe\Site\scanme\output\scanme-links-editor-tooltip-qa.png`
- Focused scrollbar state: `C:\My Stuff\Posao\ScanMe\Site\scanme\output\scanme-links-editor-scrollbar-qa.png`
- Route: `http://localhost:3000/cognis/editor`
- Browser viewport: 1918 × 924 CSS px
- Source pixels: 1672 × 941
- Implementation pixels: 1918 × 924
- Reported device pixel ratio: 2; the browser screenshot API returned CSS-normalized 1918 × 924 output, so no additional density normalization was applied.
- State: light-only editor, mobile preview, Background panel open with Flat selected.

The source shows the Styles panel while the implementation evidence shows the Background panel. Panel content is therefore not treated as a one-to-one content comparison; the shared shell, rail, glass treatment, workspace balance, phone placement, toolbar, typography, colors, radii, and active states are compared directly.

## Full-view comparison

- Typography: the implementation preserves the source hierarchy and compact application-scale labels. The working panel has clearer secondary text and does not introduce display typography that competes with the preview.
- Spacing and layout: the separated upper/lower rails, contextual panel, quiet phone workspace, and right-shifted preview match the intended composition. The narrower rail and compact controls improve usable density while preserving large rounded containers.
- Colors and tokens: the warm light glass, peach active fill, neutral shadows, and restrained background color fields are coherent with the visual target. The Flat selector now uses the same active fill, highlight, border, and elevation as the vertical rail.
- Image quality: the real Cognis logo and existing interface icons remain intact; no visible logo or image asset was approximated with CSS or replacement artwork.
- Copy: Serbian-Latin labels remain task-oriented and concise. Friendly color names accompany, but do not replace, exact HEX values.

## Focused comparison

The focused tooltip screenshot verifies that the disabled Glass option uses a light, high-contrast application tooltip instead of a browser-native black bar. The Background screenshot verifies that the horizontal selector has no scrollbar, evenly distributes all choices, and exposes a clearly saturated active Flat surface.

The latest interaction pass verifies a browser-independent custom scrollbar: the native scrollbar is fully hidden, the visible control has a 1 px rail and 6 px warm glass thumb, and there are no arrow elements or wide track background.

## Interaction checks

- Phone clock matched the same-page local time value (`20:36`) during the check.
- Selecting an analytics period changed the value to `Poslednjih 30 dana` while Analytics remained active.
- Selecting Instagram produced the editor selection outline; clicking the phone background cleared only the selected destination while keeping Content open. Switching to any other tool cleared the destination selection, while a genuine blank-workspace click closed the contextual panel.
- The 30-day analytics panel reported no horizontal overflow (`498 px` client and scroll widths). Its chart retained the only horizontal overflow (`414 px` client width, `1616 px` scroll width), began at the earliest date, and converted vertical wheel movement into horizontal chart movement while horizontal range remained.
- Repeating the period-select, chart-scroll-to-end, chart-scroll-back, and panel-return flow left the analytics trigger without an external outline in both open and closed states. Computed styles reported `outline: none` and only the intended inset warm focus treatment.
- Glass remained visible and disabled for the current style and exposed the requested explanatory tooltip.
- Radius controls exposed distinct `Oštro`, `Srednje`, and `Naglašeno` options.
- Editor root reported `color-scheme: light`.
- No browser console warnings or errors were reported after the interaction pass.

## Comparison history

### Media background follow-up

- User references: `C:\Users\user\AppData\Local\Temp\codex-clipboard-a074c6c6-3d0b-4536-9409-eb75e773ef5e.png` and `C:\Users\user\AppData\Local\Temp\codex-clipboard-587f0638-5a03-4a15-bf93-f2b9f7d13407.png`.
- Focused evidence: `C:\My Stuff\Posao\ScanMe\Site\scanme\output\scanme-links-media-background-qa.png`.
- With Video and Ispuni selected, the phone viewport, template frame, media layer, and video all measured exactly 324 x 694 CSS px with matching edges; the rendered video reported `object-fit: cover`.
- The media replacement card rendered a decoded 1920 x 1080 video frame at 0.1 s. Switching to the stored image rendered its real 947 x 830 content instead of an empty placeholder.
- The public route uses the same media layer and fit rules. Its currently published state has no media background, so the live video state was not changed merely for QA.
- Corner-mask correction evidence: `C:\My Stuff\Posao\ScanMe\Site\scanme\output\scanme-links-phone-corners-qa.png`. The nested 4 px screen inset and second 39 px radius were removed; the screen, template frame, media layer, and video now share identical edges beneath one uniform 7 px device bezel.
- Pixel-seam correction evidence: `C:\My Stuff\Posao\ScanMe\Site\scanme\output\scanme-links-phone-no-white-seam-qa.png`. The media viewport now overscans the bezel by 1 px, uses the bezel color as its fallback instead of ivory, and has a 2 px black inner-edge mask so rounded-edge antialiasing cannot reveal light fallback pixels.
- Final corner-mask evidence: `C:\My Stuff\Posao\ScanMe\Site\scanme\output\scanme-links-phone-fill-corners-final-qa.png`; focused source/implementation comparison: `C:\My Stuff\Posao\ScanMe\Site\scanme\output\scanme-links-phone-fill-comparison-final-qa.png`. The phone no longer uses a rounded CSS border as the clipping boundary: a 45 px screen mask now sits inside the solid 52 px black shell, while cover media overscans that mask by 2 px. The four-corner pass shows only the uploaded media and the dark bezel, with no ivory fallback pixels between them.
- Clean-bezel correction evidence: `C:\My Stuff\Posao\ScanMe\Site\scanme\output\scanme-links-phone-clean-bezel-corner-final-qa.png`; focused source/implementation comparison: `C:\My Stuff\Posao\ScanMe\Site\scanme\output\scanme-links-phone-clean-bezel-comparison-final-qa.png`. The supplemental inset-shadow rim that introduced the visible dotted/pixelated double edge was removed completely. The phone now renders one uninterrupted black bezel around the existing rounded screen mask, while the 2 px cover-media overscan remains in place.
- Under-bezel media correction evidence: `C:\My Stuff\Posao\ScanMe\Site\scanme\output\scanme-links-phone-media-under-bezel-corners-qa.png`; focused before/after comparison: `C:\My Stuff\Posao\ScanMe\Site\scanme\output\scanme-links-phone-no-inner-seam-comparison-qa.png`. Removing the supplemental rim exposed the rounded screen clip's light antialias fringe. The final structure no longer clips media at that inner edge: the 354 x 724 cover video underpaints the full 350 x 720 phone, and a single solid 7 px bezel is painted over it. All four corners now contain uploaded media directly beneath the bezel with no light fallback pixels and no inset shadow or blurred rim.
- Browser video-control correction source: `C:\Users\user\AppData\Local\Temp\codex-clipboard-8d060ac0-6174-499f-a285-7ace153408ce.png`; focused implementation comparison: `C:\My Stuff\Posao\ScanMe\Site\scanme\output\scanme-links-video-controls-comparison-qa.png`. Opera ignored the standard Picture-in-Picture request and still painted its proprietary overlay over the visible video element. The uploaded background now renders through a 708 x 1448 canvas while the decoding video is clipped to an invisible 1 x 1 px surface with native controls, PiP, remote playback, AirPlay, pointer events, and the video context menu disabled. Three consecutive Opera reloads exposed zero visible video elements and no browser video overlay; playback remained active and the canvas retained the same cover crop.

1. Earlier evidence showed a low-contrast Flat active state and inconsistent browser-native tooltip treatment.
2. The Flat active surface was aligned with the vertical rail's warm peach gradient, rim highlight, saturation, and elevation. Native chart/editor tooltips were replaced with the custom light tooltip treatment.
3. Post-fix browser evidence confirmed the active state, tooltip visibility, light theme, panel persistence, selection clearing, and lack of horizontal overflow.
4. A follow-up pass replaced the still-generic contextual-panel scrollbar with a fully custom overlay. Computed browser styles confirmed `scrollbar-width: none`, `overflow-x: hidden`, a 1 px rail, a 6 px thumb, equal panel client/scroll widths, and zero arrow elements.

## Findings

No actionable P0, P1, or P2 visual differences remain for the requested states. The source and implementation intentionally show different contextual-panel content.

## Follow-up polish

- P3: Revisit exact panel/phone proportions only after the placeholder style cards are replaced with final style previews; their eventual information density will determine the best final panel width.

## Final result

passed

---

# Design QA - ScanMe hero carousel

## Evidence

- Source visual truth: `C:\Users\user\AppData\Local\Temp\codex-clipboard-7834b1b1-66cc-4e9f-81e8-4aec2c4cfb5a.png`
- Focused phone reference: `C:\Users\user\AppData\Local\Temp\codex-clipboard-26ef496e-1308-46b9-b5f8-a0b91e1645f5.png`
- Browser-rendered Links implementation: `C:\My Stuff\Posao\ScanMe\Site\scanme\output\hero-carousel-links-dark-1653x824.png`
- Browser-rendered Review implementation: `C:\My Stuff\Posao\ScanMe\Site\scanme\output\hero-carousel-review-dark-desktop.png`
- Mobile implementation: `C:\My Stuff\Posao\ScanMe\Site\scanme\output\hero-carousel-links-mobile.png`
- Full-view side-by-side comparison: `C:\My Stuff\Posao\ScanMe\Site\scanme\output\hero-carousel-design-comparison.png`
- Focused phone comparison: `C:\My Stuff\Posao\ScanMe\Site\scanme\output\hero-carousel-phone-comparison.png`
- Route: `http://localhost:3000/`
- Desktop viewport: 1653 x 824 CSS px; implementation capture: 1638 x 817 px at DPR 1 after the browser scrollbar/chrome crop.
- Source pixels: 3840 x 1914. The source was normalized to the implementation capture dimensions for the combined comparison.
- Mobile viewport: 390 x 844 CSS px; implementation capture: 375 x 812 px.
- States: dark Links during the first add-link transition, dark Review Maps/ranking, and mobile Links touch layout.

## Full-view comparison

- Typography: the carousel preserves the existing IBM Plex Mono hierarchy, optical weights, compact uppercase service labels, and the established large two-line hero treatment.
- Spacing and layout: the service selector occupies the marked region above the animation, while the active service name, headline, description, and unchanged CTAs remain aligned in the left column. The mobile order is selector, copy/CTA, then player, with zero horizontal overflow.
- Colors and tokens: both themes use the existing off-black/cream surfaces and acid-lime signal. The phone uses a restrained theme-aware surface rather than adding a new palette or a generic gradient.
- Image and icon fidelity: the existing QR asset logic and real icon-library Instagram, Facebook, Website, Store, and cursor icons are used. No new raster replacement or emoji approximation was introduced.
- Copy: Links and Review text match the approved Serbian-Latin product copy. Existing CTA labels and destinations remain unchanged.

## Focused comparison

The phone comparison confirms that the simplified animated Links page keeps the reference hierarchy: a centered business identity, vertically stacked destination cards, a separate add-link control, and quiet ScanMe attribution. The implementation intentionally removes reference-only client branding and long descriptive copy, adds stable right-aligned click counters, and uses the shared ScanMe animation frame.

## Interaction checks

- First load starts with Links copy and the Links QR scene.
- A complete Links cycle switched to Review, and a complete Review cycle switched back to Links using timeline completion callbacks rather than a separate timer.
- Manual changes in both directions restarted the selected timeline from QR and froze the previous timeline at its exact frame.
- Clicking the already active service did not reset its timeline.
- Keyboard focus on the service selector paused the timeline; leaving the hero viewport paused it and returning resumed it.
- Mobile rendered the touch ripple and hid the virtual cursor; desktop rendered the cursor.
- Light and dark themes, 1440-class desktop, 1653 x 824 desktop, and 390 x 844 mobile states showed no horizontal overflow or layout shift.
- The shared Review QR/scan sequence and Review Maps scene remained visually unchanged.
- No browser console warnings or errors were reported.
- The reduced-motion and hidden-tab branches are implemented in code. The selected in-app browser did not expose media emulation and did not mark the controlled tab hidden when a second in-app tab opened, so those two environmental signals could not be toggled live in this pass.

## Comparison history

1. The first interaction pass found that a previously completed Review timeline could resume near its end after a manual selection.
2. Activation was changed to a true GSAP restart, preserving the crossfade while resetting the selected cycle to its QR frame.
3. The repeated rapid-switch test confirmed that the active animation restarted at QR and the inactive scan transform and counter remained frozen.

## Findings

No actionable P0, P1, or P2 visual differences remain for the requested hero carousel states. The phone is intentionally a simplified animation representation rather than a literal copy of the editor preview.

## Follow-up polish

- P3: Revisit the generic Store mark only after ScanMe Links receives a dedicated product symbol.

## Final implementation verification (current build)

- Fresh light desktop Links growth state with all three cards and a visible `+1 KLIK`: `output/hero-carousel-final-links-light-growth.png`.
- Fresh light desktop cursor state: `output/hero-carousel-final-links-light-cursor.png`.
- Fresh light desktop Review Maps/ranking state: `output/hero-carousel-final-review-light-desktop.png`.
- Fresh dark mobile selector/copy/player, full phone, and touch-ripple states: `output/hero-carousel-final-links-dark-mobile-ripple.png`, `output/hero-carousel-final-links-dark-mobile-player.png`, and `output/hero-carousel-final-links-dark-mobile-player-ripple.png`.
- Fresh exact 2048 x 1024 Links state: `output/hero-carousel-final-links-light-2048x1024.png`.
- The final full-cycle trace changed Links to Review at the Links timeline completion and Review back to Links at the Review timeline completion. During each 360 ms crossfade both roots existed; after the exit completed only the active animation root remained.
- The outgoing GSAP playhead stayed byte-for-byte frozen during exit, then its component unmounted and reverted its context, observers, and visibility listener.
- Rapid Review-to-Links switching left exactly one Links root at its QR phase and no Review root. Clicking the already active Links selector allowed the scan playhead to continue instead of resetting it.
- Keyboard focus paused the selector timeline. Offscreen sampling held the active playhead unchanged for 520 ms.
- Horizontal overflow was exactly zero at 320 x 780, 375 x 812, 1440 x 900, and 2048 x 1024.
- The 2048 px pass exposed a Links headline/player collision. The Links-only type cap was reduced, and the final measured boxes now have a 38 px gap with zero overlap.
- Hidden-tab, inactive, selector-paused, and offscreen playback decisions are covered by the shared pure playback guard tests.
- The selected in-app browser still does not expose reduced-motion media emulation. The reduced-motion branches were inspected in source: no GSAP timeline or autoplay is created, Links renders the final three-card phone, Review renders the static Maps state, and Framer transitions use zero duration.
- Browser console warnings/errors: none.
- `npm.cmd test`: 5 files and 44 tests passed.
- `npm.cmd run check`: ESLint, TypeScript, and the Next.js production build passed.

## Final result

passed
