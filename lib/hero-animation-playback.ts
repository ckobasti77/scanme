export type HeroAnimationPlaybackState = {
  active: boolean;
  visible: boolean;
  paused: boolean;
  documentHidden: boolean;
};

export type HeroCarouselCycleAction = "repeat" | "switch";

type HeroAnimationViewportBox = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
};

export function shouldPlayHeroAnimation({
  active,
  visible,
  paused,
  documentHidden,
}: HeroAnimationPlaybackState) {
  return active && visible && !paused && !documentHidden;
}

export function isHeroAnimationVisible(
  box: HeroAnimationViewportBox,
  viewportWidth: number,
  viewportHeight: number,
  threshold = 0.12,
) {
  const area = box.width * box.height;
  if (area <= 0) return false;

  const visibleWidth = Math.max(
    0,
    Math.min(box.right, viewportWidth) - Math.max(box.left, 0),
  );
  const visibleHeight = Math.max(
    0,
    Math.min(box.bottom, viewportHeight) - Math.max(box.top, 0),
  );

  return (visibleWidth * visibleHeight) / area >= threshold;
}

export function getHeroCarouselCycleAction({
  autoplayEnabled,
  completedCycles,
  cyclesBeforeSwitch = 2,
}: {
  autoplayEnabled: boolean;
  completedCycles: number;
  cyclesBeforeSwitch?: number;
}): { action: HeroCarouselCycleAction; completedCycles: number } {
  if (!autoplayEnabled) {
    return { action: "repeat", completedCycles: 0 };
  }

  const nextCompletedCycles = completedCycles + 1;
  if (nextCompletedCycles >= cyclesBeforeSwitch) {
    return { action: "switch", completedCycles: 0 };
  }

  return { action: "repeat", completedCycles: nextCompletedCycles };
}
