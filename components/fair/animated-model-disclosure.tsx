"use client";

import { ChevronDown, FileText } from "lucide-react";
import { useState } from "react";

export function AnimatedModelDisclosure({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="fair-model-disclosure" data-open={open}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="fair-model-disclosure-content"
        onClick={() => setOpen((current) => !current)}
      >
        <FileText aria-hidden="true" />
        <span>{label}</span>
        <ChevronDown className="fair-disclosure-chevron" aria-hidden="true" />
      </button>
      <div className="fair-model-disclosure__drop" aria-hidden={!open}>
        <div className="fair-model-disclosure__drop-inner">
          <div id="fair-model-disclosure-content" className="fair-model-disclosure__content">
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
