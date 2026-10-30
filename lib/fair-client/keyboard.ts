// Keeps a focused field in a scrolling sheet visible right above the phone
// keyboard. The keyboard only shrinks the visual viewport (Chrome on Android,
// iOS Safari), so a fixed sheet stays where it is and the field can end up
// behind it: while the field is focused the sheet's scroller gets the
// keyboard's height as bottom padding and scrolls the field above the keyboard.

function scrollParent(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = window.getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return node;
  }
  return null;
}

export function keepAboveKeyboard(field: HTMLElement, gap = 12): void {
  const viewport = window.visualViewport;
  const scroller = scrollParent(field);
  if (!viewport || !scroller) return;
  const reveal = () => {
    const keyboard = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
    scroller.style.paddingBottom = keyboard > 0 ? `${keyboard}px` : "";
    const overlap = field.getBoundingClientRect().bottom + gap - (viewport.offsetTop + viewport.height);
    if (overlap > 0) scroller.scrollTop += overlap;
  };
  const timer = window.setTimeout(reveal, 350);
  const stop = () => {
    window.clearTimeout(timer);
    viewport.removeEventListener("resize", reveal);
    field.removeEventListener("blur", stop);
    scroller.style.paddingBottom = "";
  };
  viewport.addEventListener("resize", reveal);
  field.addEventListener("blur", stop);
  reveal();
}
