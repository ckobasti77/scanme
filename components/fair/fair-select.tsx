"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { FAIR_DURATION, FAIR_EASE } from "./fair-motion";

// 30 Oct 2026 (AMF): the fair's own select — a field-styled button whose
// chevron turns 180° and an inline list that opens/closes by height with the
// fair motion tokens (instant under reduced motion). Used by the lead form's
// model selector and Nikom's purchase questions.

export type FairSelectOption = { id: string; label: string; detail?: string };

export function FairSelect({
  label,
  placeholder,
  options,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  options: readonly FairSelectOption[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const id = useId();
  const selected = options.find((option) => option.id === value);
  return (
    <div className="fair-select" data-open={open || undefined}>
      <span className="fair-select__label" id={`${id}-label`}>
        {label}
      </span>
      <button
        type="button"
        className="fair-select__button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-value`}
        onClick={() => setOpen((current) => !current)}
      >
        <span id={`${id}-value`} className="fair-select__value" data-empty={!selected || undefined}>
          {selected ? (
            <>
              {selected.detail ? <small>{selected.detail}</small> : null}
              {selected.label}
            </>
          ) : (
            placeholder
          )}
        </span>
        <ChevronDown aria-hidden="true" className="fair-select__chevron" />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="list"
            className="fair-select__panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1, transition: { duration: reduceMotion ? 0 : FAIR_DURATION.overlay, ease: FAIR_EASE.enter } }}
            exit={{ height: 0, opacity: 0, transition: { duration: reduceMotion ? 0 : FAIR_DURATION.state, ease: FAIR_EASE.exit } }}
          >
            <ul role="listbox" aria-labelledby={`${id}-label`}>
              {options.map((option) => (
                <li key={option.id} role="none">
                  <button
                    type="button"
                    role="option"
                    aria-selected={option.id === value}
                    onClick={() => {
                      onChange(option.id);
                      setOpen(false);
                    }}
                  >
                    <span>
                      {option.detail ? <small>{option.detail}</small> : null}
                      {option.label}
                    </span>
                    {option.id === value ? <Check aria-hidden="true" /> : null}
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
