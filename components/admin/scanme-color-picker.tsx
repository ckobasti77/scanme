"use client";

import { Check, ChevronDown, Copy, Pipette } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { colorDisplayName } from "@/lib/color-display-name";
import {
  clamp,
  cmykToRgb,
  hexToRgb,
  hslToRgb,
  hsvToRgb,
  isCompleteHexColor,
  normalizeHexColor,
  rgbToCmyk,
  rgbToHex,
  rgbToHsl,
  stableHsvFromHex,
  type CmykColor,
  type HsvColor,
} from "@/lib/scanme-color";
import editorStyles from "./scanme-links-editor.module.css";
import styles from "./scanme-color-picker.module.css";

type PickerMode = "Picker" | "HSL" | "RGB" | "CMYK";
type PickerPosition = { left: number; top: number; ready: boolean };

type EyeDropperResult = { sRGBHex: string };
type EyeDropperInstance = { open: () => Promise<EyeDropperResult> };
type EyeDropperConstructor = new () => EyeDropperInstance;

const PICKER_MODES: PickerMode[] = ["Picker", "HSL", "RGB", "CMYK"];
const VIEWPORT_GAP = 14;
const CARD_GAP = 14;
const HUE_THUMB_SIZE = 27;

export function ScanMeColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const hexInputRef = useRef<HTMLInputElement>(null);
  const currentHex = normalizeHexColor(value);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PickerMode>("Picker");
  const [menuOpen, setMenuOpen] = useState(false);
  const [previousHex, setPreviousHex] = useState(currentHex);
  const [position, setPosition] = useState<PickerPosition>({
    left: 0,
    top: 0,
    ready: false,
  });
  const [copied, setCopied] = useState(false);
  const eyedropperSupported =
    typeof window !== "undefined" &&
    typeof (window as Window & { EyeDropper?: EyeDropperConstructor })
      .EyeDropper === "function";

  const closePicker = useCallback((restoreFocus = false) => {
    setOpen(false);
    setMenuOpen(false);
    setCopied(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  // Spoljna promena boje (picker, undo, kontrast-asistent) osvežava polje,
  // ali ne dok korisnik kuca u njemu — remount/rewrite bi mu oteo fokus.
  useEffect(() => {
    const input = hexInputRef.current;
    if (input && document.activeElement !== input) input.value = value;
  }, [value]);

  const openPicker = useCallback(() => {
    const openingHex = normalizeHexColor(value);
    setPreviousHex(openingHex);
    setMenuOpen(false);
    setPosition((current) => ({ ...current, ready: false }));
    setOpen(true);
  }, [value]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        panelRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      closePicker();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closePicker(true);
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closePicker, open]);

  useLayoutEffect(() => {
    if (!open) return;
    let frame = 0;

    function updatePosition() {
      const trigger = triggerRef.current;
      const panel = panelRef.current;
      if (!trigger || !panel) return;
      const triggerRect = trigger.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const contextRect = trigger
        .closest<HTMLElement>('[data-context-panel="true"]')
        ?.getBoundingClientRect();
      const right = (contextRect?.right ?? triggerRect.right) + CARD_GAP;
      const left =
        (contextRect?.left ?? triggerRect.left) - panelRect.width - CARD_GAP;
      const nextLeft =
        right + panelRect.width <= window.innerWidth - VIEWPORT_GAP
          ? right
          : left >= VIEWPORT_GAP
            ? left
            : clamp(
                triggerRect.left,
                VIEWPORT_GAP,
                window.innerWidth - panelRect.width - VIEWPORT_GAP,
              );
      const nextTop = clamp(
        triggerRect.top - 24,
        VIEWPORT_GAP,
        window.innerHeight - panelRect.height - VIEWPORT_GAP,
      );
      setPosition({ left: nextLeft, top: nextTop, ready: true });
    }

    frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [menuOpen, mode, open]);

  const commitHex = useCallback(
    (next: string) => onChange(normalizeHexColor(next)),
    [onChange],
  );

  async function copyHex() {
    try {
      await navigator.clipboard.writeText(currentHex);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = currentHex;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.append(textArea);
      textArea.select();
      document.execCommand("copy");
      textArea.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  async function pickFromScreen() {
    const EyeDropper = (
      window as Window & { EyeDropper?: EyeDropperConstructor }
    ).EyeDropper;
    if (!EyeDropper) return;
    try {
      const result = await new EyeDropper().open();
      commitHex(result.sRGBHex);
    } catch {
      // The native picker rejects when the user cancels it.
    }
  }

  const picker = open ? (
    <div
      ref={panelRef}
      className={styles.card}
      role="dialog"
      aria-label={`${label} color picker`}
      data-editor-preserve-panel="true"
      style={{
        left: position.left,
        top: position.top,
        visibility: position.ready ? "visible" : "hidden",
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {menuOpen ? (
        <ModeMenu
          selected={mode}
          onSelect={(nextMode) => {
            setMode(nextMode);
            setMenuOpen(false);
          }}
        />
      ) : mode === "Picker" ? (
        <PickerView
          value={currentHex}
          previousValue={previousHex}
          onChange={commitHex}
        />
      ) : (
        <ChannelView mode={mode} value={currentHex} onChange={commitHex} />
      )}

      <footer className={styles.footer}>
        <button
          type="button"
          className={styles.modeButton}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((current) => !current)}
        >
          {mode}
          <ChevronDown
            className={styles.chevron}
            data-open={menuOpen}
            aria-hidden="true"
          />
        </button>
        <span className={styles.footerActions}>
          {eyedropperSupported ? (
            <button
              type="button"
              className={styles.iconButton}
              aria-label="Eyedropper"
              onClick={() => void pickFromScreen()}
            >
              <Pipette aria-hidden="true" />
            </button>
          ) : null}
          <button
            type="button"
            className={styles.iconButton}
            aria-label={copied ? "HEX copied" : "Copy HEX"}
            onClick={() => void copyHex()}
          >
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          </button>
        </span>
      </footer>
    </div>
  ) : null;

  return (
    <div className={editorStyles.fieldLabel}>
      <span>{label}</span>
      <span className={editorStyles.colorControl}>
        <button
          ref={triggerRef}
          className={editorStyles.colorInput}
          type="button"
          style={{ background: currentHex }}
          aria-label={`${label} izbor boje`}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => (open ? closePicker() : openPicker())}
        >
          <span className="sr-only">{currentHex}</span>
        </button>
        <span className={editorStyles.colorValueControl}>
          <span className={editorStyles.colorName}>
            {colorDisplayName(value)}
          </span>
          <input
            ref={hexInputRef}
            className={editorStyles.colorHexInput}
            defaultValue={value}
            maxLength={9}
            spellCheck={false}
            onChange={(event) => {
              const draft = event.target.value.startsWith("#")
                ? event.target.value.toUpperCase()
                : `#${event.target.value.toUpperCase()}`;
              if (isCompleteHexColor(draft)) onChange(draft);
            }}
            onBlur={(event) => {
              event.currentTarget.value = value;
            }}
            aria-label={`${label} heksadecimalna vrednost`}
          />
        </span>
      </span>
      {picker && typeof document !== "undefined"
        ? createPortal(picker, document.body)
        : null}
    </div>
  );
}

function PickerView({
  value,
  previousValue,
  onChange,
}: {
  value: string;
  previousValue: string;
  onChange: (value: string) => void;
}) {
  const [hsv, setHsv] = useState<HsvColor>(() => stableHsvFromHex(value));
  const hsvRef = useRef(hsv);
  const draggingPointerRef = useRef<number | null>(null);
  const changeFrameRef = useRef<number | null>(null);
  const pendingHexRef = useRef<string | null>(null);
  const onChangeRef = useRef(onChange);

  const previousHsv = stableHsvFromHex(previousValue);
  const displayHex = rgbToHex(hsvToRgb(hsv));

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (draggingPointerRef.current !== null) return;
    const next = stableHsvFromHex(value, hsvRef.current);
    hsvRef.current = next;
    setHsv((current) =>
      current.h === next.h && current.s === next.s && current.v === next.v
        ? current
        : next,
    );
  }, [value]);

  useEffect(
    () => () => {
      if (changeFrameRef.current !== null) {
        window.cancelAnimationFrame(changeFrameRef.current);
      }
    },
    [],
  );

  function flushChange() {
    if (changeFrameRef.current !== null) {
      window.cancelAnimationFrame(changeFrameRef.current);
      changeFrameRef.current = null;
    }
    if (!pendingHexRef.current) return;
    const nextHex = pendingHexRef.current;
    pendingHexRef.current = null;
    onChangeRef.current(nextHex);
  }

  function updateDraft(next: HsvColor, immediately = false) {
    hsvRef.current = next;
    setHsv(next);
    pendingHexRef.current = rgbToHex(hsvToRgb(next));

    if (immediately) {
      flushChange();
      return;
    }
    if (changeFrameRef.current !== null) return;
    changeFrameRef.current = window.requestAnimationFrame(() => {
      changeFrameRef.current = null;
      if (!pendingHexRef.current) return;
      const nextHex = pendingHexRef.current;
      pendingHexRef.current = null;
      onChangeRef.current(nextHex);
    });
  }

  function updatePlane(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const saturation = clamp(
      ((event.clientX - rect.left) / rect.width) * 100,
      0,
      100,
    );
    const brightness = clamp(
      100 - ((event.clientY - rect.top) / rect.height) * 100,
      0,
      100,
    );
    updateDraft({ h: hsvRef.current.h, s: saturation, v: brightness });
  }

  function finishPlaneDrag(
    event: ReactPointerEvent<HTMLDivElement>,
    updateAtRelease: boolean,
  ) {
    if (draggingPointerRef.current !== event.pointerId) return;
    if (updateAtRelease) updatePlane(event);
    flushChange();
    draggingPointerRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <div className={styles.pickerBody}>
      <div
        className={styles.colorPlane}
        role="slider"
        tabIndex={0}
        aria-label="Saturation and brightness"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.s)}
        aria-valuetext={`${Math.round(hsv.s)}% saturation, ${Math.round(hsv.v)}% brightness`}
        style={{ "--picker-hue": hsv.h } as CSSProperties}
        onPointerDown={(event) => {
          event.preventDefault();
          draggingPointerRef.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          updatePlane(event);
        }}
        onPointerMove={(event) => {
          if (draggingPointerRef.current === event.pointerId) {
            updatePlane(event);
          }
        }}
        onPointerUp={(event) => finishPlaneDrag(event, true)}
        onPointerCancel={(event) => finishPlaneDrag(event, false)}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 5 : 1;
          let saturation = hsv.s;
          let brightness = hsv.v;
          if (event.key === "ArrowLeft") saturation -= step;
          else if (event.key === "ArrowRight") saturation += step;
          else if (event.key === "ArrowUp") brightness += step;
          else if (event.key === "ArrowDown") brightness -= step;
          else return;
          event.preventDefault();
          updateDraft(
            {
              h: hsv.h,
              s: clamp(saturation, 0, 100),
              v: clamp(brightness, 0, 100),
            },
            true,
          );
        }}
      >
        <span
          className={styles.planeHandle}
          style={{
            left: `${hsv.s}%`,
            top: `${100 - hsv.v}%`,
            background: displayHex,
          }}
        />
      </div>

      <HueSlider
        value={hsv.h}
        previousValue={previousHsv.h}
        color={displayHex}
        onChange={(hue) => updateDraft({ ...hsvRef.current, h: hue })}
      />

      <div className={styles.hexRow}>
        <input
          key={displayHex}
          className={styles.hexInput}
          defaultValue={displayHex}
          maxLength={7}
          spellCheck={false}
          aria-label="HEX code"
          onChange={(event) => {
            const draft = event.target.value.startsWith("#")
              ? event.target.value.toUpperCase()
              : `#${event.target.value.toUpperCase()}`;
            if (isCompleteHexColor(draft)) {
              const next = stableHsvFromHex(draft, hsvRef.current);
              updateDraft(next, true);
            }
          }}
          onBlur={(event) => {
            if (!isCompleteHexColor(event.currentTarget.value)) {
              event.currentTarget.value = displayHex;
            }
          }}
        />
        <span
          className={styles.currentSwatch}
          style={{ background: displayHex }}
        />
      </div>
    </div>
  );
}

function HueSlider({
  value,
  previousValue,
  color,
  onChange,
}: {
  value: number;
  previousValue?: number;
  color: string;
  onChange: (value: number) => void;
}) {
  const previousProgress =
    previousValue === undefined ? 0 : clamp(previousValue / 359, 0, 1);
  const previousOffset = HUE_THUMB_SIZE * (0.5 - previousProgress);

  return (
    <div className={styles.hueShell}>
      <span className={styles.hueTrack} aria-hidden="true" />
      {previousValue === undefined ? null : (
        <span
          className={styles.previousHue}
          style={{
            left: `calc(${previousProgress * 100}% + ${previousOffset}px)`,
          }}
          aria-hidden="true"
        />
      )}
      <input
        className={`${styles.channelRange} ${styles.hueRange}`}
        type="range"
        min={0}
        max={359}
        step={1}
        value={Math.round(value) % 360}
        aria-label="Hue"
        style={{ "--thumb-color": color } as CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

function ModeMenu({
  selected,
  onSelect,
}: {
  selected: PickerMode;
  onSelect: (mode: PickerMode) => void;
}) {
  return (
    <div className={styles.modeMenu} role="menu" aria-label="Color space">
      {PICKER_MODES.map((mode) => (
        <button
          key={mode}
          type="button"
          className={styles.modeOption}
          data-selected={mode === selected}
          role="menuitemradio"
          aria-checked={mode === selected}
          onClick={() => onSelect(mode)}
        >
          {mode}
          {mode === selected ? <Check aria-hidden="true" /> : null}
        </button>
      ))}
    </div>
  );
}

function ChannelView({
  mode,
  value,
  onChange,
}: {
  mode: Exclude<PickerMode, "Picker">;
  value: string;
  onChange: (value: string) => void;
}) {
  const rgb = hexToRgb(value);

  if (mode === "HSL") {
    const hsl = rgbToHsl(rgb);
    return (
      <div className={styles.channelBody}>
        <ChannelSlider
          label="Hue"
          value={hsl.h}
          max={359}
          background="linear-gradient(90deg,#ff0000,#ffff00,#00ff00,#00ffff,#0000ff,#ff00ff,#ff0000)"
          thumbColor={value}
          onChange={(h) => onChange(rgbToHex(hslToRgb({ ...hsl, h })))}
        />
        <ChannelSlider
          label="Saturation"
          value={hsl.s}
          background={`linear-gradient(90deg,hsl(${hsl.h} 0% ${hsl.l}%),hsl(${hsl.h} 100% ${hsl.l}%))`}
          thumbColor={value}
          onChange={(s) => onChange(rgbToHex(hslToRgb({ ...hsl, s })))}
        />
        <ChannelSlider
          label="Luminance"
          value={hsl.l}
          background={`linear-gradient(90deg,#000,hsl(${hsl.h} ${hsl.s}% 50%),#fff)`}
          thumbColor={value}
          onChange={(l) => onChange(rgbToHex(hslToRgb({ ...hsl, l })))}
        />
      </div>
    );
  }

  if (mode === "RGB") {
    return (
      <div className={styles.channelBody}>
        {(["r", "g", "b"] as const).map((channel) => {
          const labels = { r: "Red", g: "Green", b: "Blue" } as const;
          const start = rgbToHex({ ...rgb, [channel]: 0 });
          const end = rgbToHex({ ...rgb, [channel]: 255 });
          return (
            <ChannelSlider
              key={channel}
              label={labels[channel]}
              value={rgb[channel]}
              max={255}
              background={`linear-gradient(90deg,${start},${end})`}
              thumbColor={value}
              onChange={(next) =>
                onChange(rgbToHex({ ...rgb, [channel]: next }))
              }
            />
          );
        })}
      </div>
    );
  }

  const cmyk = rgbToCmyk(rgb);
  return (
    <div className={styles.channelBody}>
      {(["c", "m", "y", "k"] as const).map((channel) => {
        const labels = {
          c: "Cyan",
          m: "Magenta",
          y: "Yellow",
          k: "Key",
        } as const;
        const start = cmykEndpoint(cmyk, channel, 0);
        const end = cmykEndpoint(cmyk, channel, 100);
        return (
          <ChannelSlider
            key={channel}
            label={labels[channel]}
            value={cmyk[channel]}
            background={`linear-gradient(90deg,${start},${end})`}
            thumbColor={value}
            onChange={(next) =>
              onChange(rgbToHex(cmykToRgb({ ...cmyk, [channel]: next })))
            }
          />
        );
      })}
    </div>
  );
}

function ChannelSlider({
  label,
  value,
  max = 100,
  background,
  thumbColor,
  onChange,
}: {
  label: string;
  value: number;
  max?: number;
  background: string;
  thumbColor: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className={styles.channelField}>
      <span className={styles.channelHeader}>
        <span>{label}</span>
        <output>{Math.round(value)}</output>
      </span>
      <input
        className={styles.channelRange}
        type="range"
        min={0}
        max={max}
        step={1}
        value={Math.round(value)}
        style={{
          background,
          "--thumb-color": thumbColor,
        } as CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function cmykEndpoint(
  color: CmykColor,
  channel: keyof CmykColor,
  value: number,
) {
  return rgbToHex(cmykToRgb({ ...color, [channel]: value }));
}
