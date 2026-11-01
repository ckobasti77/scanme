// ADMIN v3 V1 — SVG helpers of the reveal engine (no hooks, no client code).

/**
 * The mask a ring is drawn through. Put it inside the `<svg data-admin-draw="ring">`
 * and wrap the coloured segments in `<g mask={`url(#${id})`}>`: the engine draws the
 * one circle of the mask from 0 to 100 %, so the segments and their own
 * `stroke-dasharray` stay untouched. Without JavaScript the mask is whole and the
 * ring is simply there. `size` is the side of the viewBox, `strokeWidth` the one of
 * the segments.
 */
export function AdminRingMask({ id, size, r, strokeWidth }: { id: string; size: number; r: number; strokeWidth: number }) {
  return (
    <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width={size} height={size}>
      <circle data-admin-ring-mask="" cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#fff" strokeWidth={strokeWidth + 2} />
    </mask>
  );
}
