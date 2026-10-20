/** A label of the 3D map: `x` is its centre, `y` its bottom edge, both in pixels of the canvas. */
export type LiftLabel = { x: number; y: number; width: number; height: number };

/**
 * Labels sit bottom-centre on their block. A label that would cover one nearer to the viewer (lower on the
 * screen) moves up above it; the nearer one stays on its block. Returns the bottom edge of every label.
 */
export function liftLabels(labels: readonly LiftLabel[], gap = 2): number[] {
  const y = labels.map((label) => label.y);
  const order = labels.map((_, index) => index).sort((a, b) => labels[b].y - labels[a].y || a - b);
  const placed: number[] = [];
  for (const index of order) {
    const label = labels[index];
    let moved = true;
    while (moved) {
      moved = false;
      for (const other of placed) {
        const below = labels[other];
        const overX = Math.abs(label.x - below.x) < (label.width + below.width) / 2 + gap;
        const overY = y[index] > y[other] - below.height - gap && y[index] - label.height < y[other] + gap;
        if (overX && overY) {
          y[index] = y[other] - below.height - gap;
          moved = true;
        }
      }
    }
    placed.push(index);
  }
  return y;
}
