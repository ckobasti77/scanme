declare module "culori" {
  export type OklchColor = {
    mode: "oklch";
    l: number;
    c: number;
    h?: number;
    alpha?: number;
  };

  export type Color =
    | string
    | OklchColor
    | {
        mode: string;
        alpha?: number;
        [channel: string]: string | number | undefined;
      };

  export function converter(
    mode: "oklch",
  ): (color: Color) => OklchColor | undefined;
  export function clampChroma(
    color: Color,
    mode?: string,
    rgbGamut?: string,
  ): Color;
  export function formatHex(color: Color): string | undefined;
  export function wcagContrast(first: Color, second: Color): number;
}
