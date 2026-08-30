// Site-wide word-by-word text reveal — configuration and the selectors that are
// shared, verbatim, between the pre-paint hiding stylesheet and the runtime
// splitter. Keeping them identical is the whole safety guarantee: anything the
// CSS hides is guaranteed to be something the JS will reveal.
//
// See .agents/skills/text-reveal/SKILL.md for the contract this implements.

export const TEXT_REVEAL = {
  // Copy longer than this fades as one block instead of splitting into words.
  maxWords: 60,
  // Reveal fires when the block sits 20% of the viewport height above the
  // bottom edge — i.e. the visitor has actually scrolled to it, not the instant
  // it peeks in from below.
  enterRatio: 0.2,
  // Per-word motion.
  wordDuration: 0.6,
  wordStagger: 0.04,
  wordLift: 14, // px
  // Whole-block motion (flex/grid lines and copy past maxWords).
  blockDuration: 0.7,
  blockLift: 24, // px
  blur: 8, // px, starting blur for both paths
} as const;

// The copy tags every reveal covers. A bare <div> holding text is deliberately
// not here — give it a real tag or mark it data-reveal="text".
const REVEAL_TAGS = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "li",
  "dt",
  "dd",
  "blockquote",
  "figcaption",
] as const;

export const candidateSelector = [...REVEAL_TAGS, '[data-reveal="text"]'].join(",");

// Chrome and interactive copy that must be readable the instant it appears,
// plus any subtree a component explicitly opted out of the site-wide pass.
export const skipSelector = [
  '[data-reveal="off"]',
  "nav",
  "header",
  "button",
  "a",
  "label",
  "summary",
  "input",
  "textarea",
  "select",
  "[contenteditable]",
  '[role="dialog"]',
  "[aria-live]",
].join(",");

// The stylesheet inlined by the root layout so copy is hidden before first
// paint. Scoped to [data-text-reveal-root] so admin/editor routes are never
// touched, and gated behind prefers-reduced-motion so those visitors never
// depend on JS to see the text.
export const REVEAL_HIDE_CSS = `@media (prefers-reduced-motion: no-preference){[data-text-reveal-root] :where(${candidateSelector}){opacity:0}[data-text-reveal-root] [data-reveal="off"]:where(${candidateSelector}),[data-text-reveal-root] [data-reveal="off"] :where(${candidateSelector}){opacity:1}}.reveal-word{display:inline-block}`;
