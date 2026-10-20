import type { FairBrandVector } from "./fair-brand-logo";

const art: Readonly<Record<string, { accent: string; mark: FairBrandVector }>> = {
  "demo-passport-1": { accent: "#d59866", mark: { kind: "path", hex: "#d59866", path: "M12 1 23 12 12 23 1 12Zm0 4L5 12l7 7 7-7Z" } },
  "demo-passport-2": { accent: "#7ab4a6", mark: { kind: "path", hex: "#7ab4a6", path: "M12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22Zm0 3a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm-1 3h2v10h-2ZM7 11h10v2H7Z" } },
  "demo-passport-3": { accent: "#a5add0", mark: { kind: "path", hex: "#a5add0", path: "M3 4h18v3H3Zm0 6h18v3H3Zm0 6h18v4H3Z" } },
};

export function fairDemoPassportArtwork(passportId: string) {
  return art[passportId];
}
