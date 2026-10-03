// The word splitter behind the site-wide text reveal. It MOVES the original
// text nodes into inline-block word spans — never clones them — so React keeps
// the handles it owns on the surrounding element and no event listener dies.
//
// See .agents/skills/text-reveal/SKILL.md.

const WORD_CLASS = "reveal-word";

// Interactive descendants whose text must stay whole (links, buttons, form
// controls). We reveal the copy around them but leave their own text intact.
const INLINE_SKIP = "a,button,label,summary,input,textarea,select";

/**
 * Wrap each word of every text node under `el` in a `.reveal-word` span,
 * preserving the whitespace between words so wrapping and spacing hold.
 * Returns the created word spans, in document order.
 */
export function splitWords(el: HTMLElement): HTMLElement[] {
  const words: HTMLElement[] = [];

  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent ?? "";
        if (!text.trim()) continue;

        const frag = document.createDocumentFragment();
        for (const part of text.split(/(\s+)/)) {
          if (part === "") continue;
          if (/^\s+$/.test(part)) {
            frag.appendChild(document.createTextNode(part));
          } else {
            const span = document.createElement("span");
            span.className = WORD_CLASS;
            span.textContent = part;
            frag.appendChild(span);
            words.push(span);
          }
        }
        node.replaceChild(frag, child);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const elChild = child as HTMLElement;
        if (elChild.dataset.reveal === "off") continue;
        if (elChild.matches(INLINE_SKIP)) continue;
        walk(elChild);
      }
    }
  };

  walk(el);
  return words;
}

/**
 * Reverse `splitWords`: collapse every word span back into a plain text node.
 * Used on cleanup so nothing is left half-split.
 */
export function restoreWords(el: HTMLElement): void {
  el.querySelectorAll(`.${WORD_CLASS}`).forEach((span) => {
    const parent = span.parentNode;
    if (!parent) return;
    parent.replaceChild(document.createTextNode(span.textContent ?? ""), span);
  });
  el.normalize();
}
