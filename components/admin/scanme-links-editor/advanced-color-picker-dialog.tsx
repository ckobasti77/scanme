"use client";

import { Check, Copy } from "lucide-react";
import React, { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { LiquidGlassCard } from "@/components/ui/liquid-glass-card";

// --- Color Math Helpers ---
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let clean = hex.replace(/^#/, "");
  if (clean.length === 3) {
    clean = clean
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const num = parseInt(clean, 16) || 0;
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (c: number) =>
    Math.max(0, Math.min(255, Math.round(c)))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

export function rgbToHsv(
  r: number,
  g: number,
  b: number,
): { h: number; s: number; v: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  const v = max;
  const d = max - min;
  const s = max === 0 ? 0 : d / max;

  if (max !== min) {
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    v: Math.round(v * 100),
  };
}

export function hsvToRgb(
  h: number,
  s: number,
  v: number,
): { r: number; g: number; b: number } {
  h /= 360;
  s /= 100;
  v /= 100;
  let r = 0;
  let g = 0;
  let b = 0;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);

  switch (i % 6) {
    case 0:
      r = v;
      g = t;
      b = p;
      break;
    case 1:
      r = q;
      g = v;
      b = p;
      break;
    case 2:
      r = p;
      g = v;
      b = t;
      break;
    case 3:
      r = p;
      g = q;
      b = v;
      break;
    case 4:
      r = t;
      g = p;
      b = v;
      break;
    case 5:
      r = v;
      g = p;
      b = q;
      break;
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

export function rgbToHsl(
  r: number,
  g: number,
  b: number,
): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

export function hslToRgb(
  h: number,
  s: number,
  l: number,
): { r: number; g: number; b: number } {
  h /= 360;
  s /= 100;
  l /= 100;
  let r: number;
  let g: number;
  let b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

type ColorMode = "HEX" | "RGB" | "HSL" | "HSV";

export function AdvancedColorPickerDialog({
  open,
  onOpenChange,
  color,
  label = "Prilagodi boju",
  presetSwatches = [],
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  color: string;
  label?: string;
  presetSwatches?: string[];
  onSave: (newColorHex: string) => void;
}) {
  const [prevColor, setPrevColor] = useState(color);
  const [hsv, setHsv] = useState(() => {
    const rgb = hexToRgb(color);
    return rgbToHsv(rgb.r, rgb.g, rgb.b);
  });

  const [mode, setMode] = useState<ColorMode>("HEX");
  const [copied, setCopied] = useState(false);

  const spectrumRef = useRef<HTMLDivElement>(null);
  const isDraggingSpectrum = useRef(false);

  if (color !== prevColor) {
    setPrevColor(color);
    const rgb = hexToRgb(color);
    setHsv(rgbToHsv(rgb.r, rgb.g, rgb.b));
  }

  const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
  const currentHex = rgbToHex(rgb.r, rgb.g, rgb.b);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const pureHueHex = rgbToHex(
    hsvToRgb(hsv.h, 100, 100).r,
    hsvToRgb(hsv.h, 100, 100).g,
    hsvToRgb(hsv.h, 100, 100).b,
  );

  function handleSpectrumMove(clientX: number, clientY: number) {
    if (!spectrumRef.current) return;
    const rect = spectrumRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, clientY - rect.top));

    const s = Math.round((x / rect.width) * 100);
    const v = Math.round((1 - y / rect.height) * 100);

    setHsv((prev) => ({ ...prev, s, v }));
  }

  function onPointerDownSpectrum(e: React.PointerEvent) {
    isDraggingSpectrum.current = true;
    spectrumRef.current?.setPointerCapture(e.pointerId);
    handleSpectrumMove(e.clientX, e.clientY);
  }

  function onPointerMoveSpectrum(e: React.PointerEvent) {
    if (isDraggingSpectrum.current) {
      handleSpectrumMove(e.clientX, e.clientY);
    }
  }

  function onPointerUpSpectrum(e: React.PointerEvent) {
    if (isDraggingSpectrum.current) {
      isDraggingSpectrum.current = false;
      try {
        spectrumRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer capture release fails
      }
    }
  }

  function copyHex() {
    navigator.clipboard.writeText(currentHex);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function applyPresetHex(hex: string) {
    const r = hexToRgb(hex);
    setHsv(rgbToHsv(r.r, r.g, r.b));
  }

  function submit() {
    onSave(currentHex);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-none bg-transparent p-0 shadow-none sm:max-w-md">
        <LiquidGlassCard className="p-6" tiltEnabled={true}>
          <DialogHeader>
            <DialogTitle className="text-base font-semibold tracking-tight">
              {label}
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--editor-muted)]">
              Podesite boju pomoću interaktivnog spektra, RGB, HSL ili HSV kontrola.
            </DialogDescription>
          </DialogHeader>

          {/* 2D Spectrum Canvas */}
          <div
            ref={spectrumRef}
            onPointerDown={onPointerDownSpectrum}
            onPointerMove={onPointerMoveSpectrum}
            onPointerUp={onPointerUpSpectrum}
            className="relative mt-4 h-44 w-full cursor-crosshair touch-none overflow-hidden rounded-2xl border border-white/40 shadow-[0_8px_20px_rgba(0,0,0,0.12)]"
            style={{ backgroundColor: pureHueHex }}
          >
            {/* White to transparent horizontal gradient */}
            <div className="absolute inset-0 bg-gradient-to-r from-white to-transparent" />
            {/* Transparent to black vertical gradient */}
            <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent" />

            {/* Draggable handle */}
            <div
              className="pointer-events-none absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_2px_8px_rgba(0,0,0,0.5)] ring-1 ring-black/20"
              style={{
                left: `${hsv.s}%`,
                top: `${100 - hsv.v}%`,
                backgroundColor: currentHex,
              }}
            />
          </div>

          {/* Hue Bar */}
          <div className="mt-4 grid gap-2">
            <div className="flex items-center justify-between text-[11px] font-medium text-[var(--editor-muted)]">
              <span>Nijansa (Hue)</span>
              <span className="tabular-nums">{hsv.h}°</span>
            </div>
            <div className="relative flex h-5 w-full items-center rounded-full border border-white/50 bg-white/40 px-1 shadow-inner backdrop-blur-sm">
              <input
                type="range"
                min={0}
                max={360}
                value={hsv.h}
                onChange={(e) =>
                  setHsv((prev) => ({ ...prev, h: Number(e.target.value) }))
                }
                className="h-3 w-full cursor-pointer appearance-none rounded-full bg-transparent outline-none [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-md"
                style={{
                  background:
                    "linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)",
                }}
              />
            </div>
          </div>

          {/* Color Preview & Copy Bar */}
          <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-white/60 bg-white/60 p-3 shadow-sm backdrop-blur-md">
            <div className="flex items-center gap-3">
              <span
                className="size-10 shrink-0 rounded-xl border border-black/15 shadow-sm"
                style={{ backgroundColor: currentHex }}
              />
              <div>
                <span className="block font-mono text-sm font-bold tracking-wider">
                  {currentHex}
                </span>
                <span className="text-[10px] text-[var(--editor-muted)]">
                  sRGB: {rgb.r}, {rgb.g}, {rgb.b}
                </span>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copyHex}
              className="h-8 gap-1.5 rounded-xl border-white/60 bg-white/80 px-3 text-xs shadow-sm hover:bg-white"
            >
              {copied ? (
                <Check className="size-3.5 text-green-600" />
              ) : (
                <Copy className="size-3.5" />
              )}
              {copied ? "Kopirano" : "Kopiraj"}
            </Button>
          </div>

          {/* Mode Selector Tabs */}
          <div className="mt-4 flex rounded-xl border border-white/50 bg-white/40 p-1 backdrop-blur-md">
            {(["HEX", "RGB", "HSL", "HSV"] as ColorMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  "flex-1 rounded-lg py-1.5 text-center text-xs font-semibold transition-all",
                  mode === m
                    ? "bg-white text-black shadow-sm"
                    : "text-[var(--editor-muted)] hover:text-black",
                )}
              >
                {m}
              </button>
            ))}
          </div>

          {/* Dynamic Mode Inputs */}
          <div className="mt-3 grid gap-3">
            {mode === "HEX" ? (
              <div className="grid gap-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-[var(--editor-muted)]">
                  HEX Kod
                </Label>
                <Input
                  value={currentHex}
                  maxLength={7}
                  onChange={(e) => {
                    const val = e.target.value.trim();
                    if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                      applyPresetHex(val);
                    }
                  }}
                  className="h-10 border-white/60 bg-white/70 font-mono text-xs uppercase shadow-sm"
                />
              </div>
            ) : mode === "RGB" ? (
              <div className="grid grid-cols-3 gap-2">
                <div className="grid gap-1">
                  <Label className="text-[10px] uppercase tracking-wider text-[var(--editor-muted)]">
                    Red (R)
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={255}
                    value={rgb.r}
                    onChange={(e) => {
                      const r = Math.max(
                        0,
                        Math.min(255, Number(e.target.value) || 0),
                      );
                      const newHex = rgbToHex(r, rgb.g, rgb.b);
                      applyPresetHex(newHex);
                    }}
                    className="h-10 border-white/60 bg-white/70 font-mono text-xs shadow-sm"
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-[10px] uppercase tracking-wider text-[var(--editor-muted)]">
                    Green (G)
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={255}
                    value={rgb.g}
                    onChange={(e) => {
                      const g = Math.max(
                        0,
                        Math.min(255, Number(e.target.value) || 0),
                      );
                      const newHex = rgbToHex(rgb.r, g, rgb.b);
                      applyPresetHex(newHex);
                    }}
                    className="h-10 border-white/60 bg-white/70 font-mono text-xs shadow-sm"
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-[10px] uppercase tracking-wider text-[var(--editor-muted)]">
                    Blue (B)
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={255}
                    value={rgb.b}
                    onChange={(e) => {
                      const b = Math.max(
                        0,
                        Math.min(255, Number(e.target.value) || 0),
                      );
                      const newHex = rgbToHex(rgb.r, rgb.g, b);
                      applyPresetHex(newHex);
                    }}
                    className="h-10 border-white/60 bg-white/70 font-mono text-xs shadow-sm"
                  />
                </div>
              </div>
            ) : mode === "HSL" ? (
              <div className="grid grid-cols-3 gap-2">
                <div className="grid gap-1">
                  <Label className="text-[10px] uppercase tracking-wider text-[var(--editor-muted)]">
                    Hue (H°)
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={360}
                    value={hsl.h}
                    onChange={(e) => {
                      const h = Math.max(
                        0,
                        Math.min(360, Number(e.target.value) || 0),
                      );
                      const newRgb = hslToRgb(h, hsl.s, hsl.l);
                      applyPresetHex(rgbToHex(newRgb.r, newRgb.g, newRgb.b));
                    }}
                    className="h-10 border-white/60 bg-white/70 font-mono text-xs shadow-sm"
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-[10px] uppercase tracking-wider text-[var(--editor-muted)]">
                    Sat (S%)
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={hsl.s}
                    onChange={(e) => {
                      const s = Math.max(
                        0,
                        Math.min(100, Number(e.target.value) || 0),
                      );
                      const newRgb = hslToRgb(hsl.h, s, hsl.l);
                      applyPresetHex(rgbToHex(newRgb.r, newRgb.g, newRgb.b));
                    }}
                    className="h-10 border-white/60 bg-white/70 font-mono text-xs shadow-sm"
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-[10px] uppercase tracking-wider text-[var(--editor-muted)]">
                    Light (L%)
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={hsl.l}
                    onChange={(e) => {
                      const l = Math.max(
                        0,
                        Math.min(100, Number(e.target.value) || 0),
                      );
                      const newRgb = hslToRgb(hsl.h, hsl.s, l);
                      applyPresetHex(rgbToHex(newRgb.r, newRgb.g, newRgb.b));
                    }}
                    className="h-10 border-white/60 bg-white/70 font-mono text-xs shadow-sm"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <div className="grid gap-1">
                  <Label className="text-[10px] uppercase tracking-wider text-[var(--editor-muted)]">
                    Hue (H°)
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={360}
                    value={hsv.h}
                    onChange={(e) => {
                      const h = Math.max(
                        0,
                        Math.min(360, Number(e.target.value) || 0),
                      );
                      setHsv((prev) => ({ ...prev, h }));
                    }}
                    className="h-10 border-white/60 bg-white/70 font-mono text-xs shadow-sm"
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-[10px] uppercase tracking-wider text-[var(--editor-muted)]">
                    Sat (S%)
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={hsv.s}
                    onChange={(e) => {
                      const s = Math.max(
                        0,
                        Math.min(100, Number(e.target.value) || 0),
                      );
                      setHsv((prev) => ({ ...prev, s }));
                    }}
                    className="h-10 border-white/60 bg-white/70 font-mono text-xs shadow-sm"
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-[10px] uppercase tracking-wider text-[var(--editor-muted)]">
                    Val (V%)
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={hsv.v}
                    onChange={(e) => {
                      const v = Math.max(
                        0,
                        Math.min(100, Number(e.target.value) || 0),
                      );
                      setHsv((prev) => ({ ...prev, v }));
                    }}
                    className="h-10 border-white/60 bg-white/70 font-mono text-xs shadow-sm"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Preset Logo Palette Swatches */}
          {presetSwatches.length > 0 ? (
            <div className="mt-4">
              <p className="mb-2 text-[10px] uppercase tracking-wider text-[var(--editor-muted)]">
                Paleta iz logotipa
              </p>
              <div className="flex flex-wrap gap-2">
                {presetSwatches.map((hex, idx) => (
                  <button
                    key={`${hex}-${idx}`}
                    type="button"
                    onClick={() => applyPresetHex(hex)}
                    title={`Izaberi ${hex}`}
                    className={cn(
                      "size-8 rounded-full border border-black/15 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black",
                      currentHex === hex && "scale-110 ring-2 ring-black",
                    )}
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </div>
            </div>
          ) : null}

          <DialogFooter className="mt-5 flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-10 flex-1 rounded-xl border-white/60 bg-white/80 shadow-sm hover:bg-white"
            >
              Otkaži
            </Button>
            <Button
              type="button"
              onClick={submit}
              className="h-10 flex-1 rounded-xl bg-black font-semibold text-white shadow-md hover:bg-black/80"
            >
              Primeni boju
            </Button>
          </DialogFooter>
        </LiquidGlassCard>
      </DialogContent>
    </Dialog>
  );
}
