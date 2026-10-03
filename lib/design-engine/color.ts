// Shared colour helper of the design engine's background and shadow CSS —
// lifted verbatim from the option-two Links template (RFC-001 §2.5 "Lift, do
// not copy"), which imports it back for its media overlay. Identical logic;
// the golden harness proves the move is a no-op.

export function rgba(hex: string, opacity: number) {
  const normalized = hex.trim();
  const match = normalized.match(/^#([\da-f]{6})$/i);
  if (!match) return `color-mix(in srgb, ${hex} ${opacity * 100}%, transparent)`;
  const value = Number.parseInt(match[1], 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${opacity})`;
}
