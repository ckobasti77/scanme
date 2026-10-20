export const DEMO_HEAT_PULSE_MS = 14000;
export const DEMO_HEAT_STAGGER_MS = 1800;

/** Shuffle once per viewing: every stand gets one identical breath per loop. */
export function demoHeatOrder(keys: readonly string[], random = Math.random): string[] {
  const order = [...keys];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/** Staggered breaths overlap, including across the loop seam. */
export function demoHeatAt(order: readonly string[], elapsedMs: number): Map<string, number> {
  const cycle = order.length * DEMO_HEAT_STAGGER_MS;
  const duration = Math.min(DEMO_HEAT_PULSE_MS, cycle);
  return new Map(order.map((key, index) => {
    const age = ((elapsedMs - index * DEMO_HEAT_STAGGER_MS) % cycle + cycle) % cycle;
    return [key, age < duration ? Math.sin(Math.PI * age / duration) ** 2 : 0];
  }));
}
