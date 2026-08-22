---
name: text-reveal
description: The site-wide word-by-word text reveal - every headline, paragraph, list item and standalone label on this site arrives word by word, in random order, blurred and lifted, as it crosses into the viewport. Use whenever adding or editing user-facing copy, building a new section, page or component, animating text, wiring a language switch, or debugging copy that stays invisible, flashes before it animates, appears un-animated, or comes back mistranslated. Covers the CSS/JS contract in constants/textRevealConfig.ts and lib/textReveal.ts, the data-reveal="off" opt-out, and the rule for components that need to replay the reveal.
---

# Text reveal

**Every line of copy on this site arrives word by word.** Headlines, paragraphs, list items, eyebrows, labels - all of it, on every page, as it crosses into the viewport. There is nothing to wire up on new copy: write plain semantic markup and it is covered. This skill exists so you know what already handles it, and so you do not break it.

## The one rule

**Do not write a text entrance animation.** Do not fade a headline in, do not stagger a paragraph, do not reach for SplitText, do not roll a splitter. The site has one, it runs on everything, and a second one on the same element means two animations fighting over one opacity.

If you are adding copy: write the markup. Done.

## What is covered, automatically

`constants/textRevealConfig.ts` → `candidateSelector`:

- `h1`–`h6`, `p`, `li`, `dt`, `dd`, `blockquote`, `figcaption`
- any `span` that is not inside a copy element, a link, a button or a label - the eyebrows, kickers and stat captions
- anything you explicitly mark `data-reveal="text"`

**Text that carries no tag** - a bare `<div>` holding a number, a caption typed straight into a layout box - is *not* covered. Either give it a real tag, or mark it `data-reveal="text"`. Prefer the real tag.

Copy past `TEXT_REVEAL.maxWords` (60) fades as one block instead of splitting, and a line inside a flex or grid box does the same - word spans in a flex container become flex items and every `gap` lands between the words.

## How it works, in four sentences

`TextRevealGlobal` mounts once in the shell and renders nothing. One `IntersectionObserver` with the root shrunk from the bottom by `enterRatio` fires each element once, 15% into the viewport. The splitter **moves** the original text node into word spans - never clones it - so surrounding elements keep their identity and React keeps its handles. `constants/textRevealConfig.ts` compiles the same selectors into the stylesheet the root layout inlines, which is what hides copy before first paint; JS is what brings it back.

Read `.claude/rules/architecture.md` → "Text Reveal" before changing any of it.

## Opting out - and what you owe when you do

`data-reveal="off"` on any subtree takes it out of the site-wide pass. It is correct in exactly two cases:

1. **Chrome that must be readable the instant it appears** - navigation, forms, live regions, dialogs. Most of these are already matched by `skipSelector`; check before adding the attribute.
2. **Copy whose opacity another animation already owns** - the hero (locked to the cube's clock), the typed console headline, a discipline panel that replays on every step.

Case 2 comes with a debt: **the copy still has to arrive word by word.** Opting out buys you control of the timing, not permission to fade a block in. Use `splitWords` / `restoreWords` from `lib/textReveal.ts` - never a local splitter - and follow `DisciplineCopy.tsx`, which is the reference implementation.

## The four things that break it

1. **Splitting without restoring.** A split element carries `data-no-translate`, so `LanguageProvider` cannot reach it. Restore on cleanup *and* on a locale change, before the translation walker runs - which is why any component doing its own split must live inside `LanguageProvider` (React runs the child effect first).
2. **`autoAlpha` where the copy must stay in the accessibility tree.** It writes `visibility: hidden`. In the discipline panels - six panels in the DOM at once, all of them the section's SEO - use plain `opacity`.
3. **Hiding copy from CSS on your own.** The hiding rule is generated from the shared selectors for exactly one reason: anything hidden is guaranteed to have something that will reveal it. A hand-written `opacity: 0` has no such guarantee, and copy that never enters the viewport never comes back.
4. **Cloning text nodes.** Clone and React loses the node it thinks it owns, and every handler on the cloned subtree is dead. Move it.

## Checking your work

Load the page and, after scrolling it end to end, this must return nothing:

```js
[...document.querySelectorAll('*')].filter(e => e.offsetParent && e.textContent.trim() && getComputedStyle(e).opacity === '0')
```

Anything listed is copy the CSS hid and nothing revealed. Also confirm `[data-reveal-state="pending"]` is empty at the bottom of the page, and that a language switch leaves `.reveal-word` at zero with the text whole.
