import { describe, expect, test } from "vitest";
import { decideScanStoryClick } from "./scan-story-transition";

const idle = { activeIndex: 0, transitionInFlight: false, reducedMotion: false };

describe("decideScanStoryClick", () => {
  test("klik na drugu karticu pokreće prelaz", () => {
    expect(decideScanStoryClick({ ...idle, targetIndex: 1 })).toBe("animate");
    expect(decideScanStoryClick({ ...idle, targetIndex: 2 })).toBe("animate");
    expect(decideScanStoryClick({ ...idle, activeIndex: 2, targetIndex: 0 })).toBe("animate");
  });

  test("klik na aktivnu karticu ne radi ništa", () => {
    expect(decideScanStoryClick({ ...idle, targetIndex: 0 })).toBe("ignore");
    expect(decideScanStoryClick({ ...idle, reducedMotion: true, targetIndex: 0 })).toBe("ignore");
  });

  test("dok prelaz traje, ignoriše se svaki klik — na istu ili drugu karticu", () => {
    const inFlight = { ...idle, transitionInFlight: true };
    for (const targetIndex of [0, 1, 2]) {
      expect(decideScanStoryClick({ ...inFlight, targetIndex })).toBe("ignore");
      expect(decideScanStoryClick({ ...inFlight, reducedMotion: true, targetIndex })).toBe("ignore");
    }
  });

  test("uz reduced motion promena je trenutna", () => {
    expect(decideScanStoryClick({ ...idle, reducedMotion: true, targetIndex: 2 })).toBe("instant");
  });

  test("scenario brzih klikova: 1→2, pa 5× na 2 i 1× na 3 usred prelaza", () => {
    let activeIndex = 0;
    let transitionInFlight = false;
    const started: number[] = [];
    const click = (targetIndex: number) => {
      const decision = decideScanStoryClick({ activeIndex, targetIndex, transitionInFlight, reducedMotion: false });
      if (decision === "animate") {
        started.push(targetIndex);
        transitionInFlight = true;
      }
    };

    click(1);
    for (let i = 0; i < 5; i += 1) click(1);
    click(2);
    // prelaz 1→2 sleće
    transitionInFlight = false;
    activeIndex = 1;

    expect(started).toEqual([1]);
    expect(activeIndex).toBe(1);
    // posle sletanja: aktivna ne radi ništa, druga pokreće novi prelaz
    click(1);
    expect(started).toEqual([1]);
    click(2);
    expect(started).toEqual([1, 2]);
  });
});
