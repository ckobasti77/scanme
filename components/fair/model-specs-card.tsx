"use client";

import {
  BatteryCharging,
  ChevronDown,
  FileText,
  Gauge,
  PlugZap,
  Route,
  Settings2,
  SlidersHorizontal,
  Timer,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useId, useState } from "react";
import type { FairModelDict } from "@/lib/i18n";
import type { FairKeySpec, FairKeySpecKind } from "./model-key-specs";

// Model page v2: the key-spec strip and, attached to the same card, the full
// grouped list behind one toggle. Free opens it by default (the page may
// scroll into it); Starter/Advanced keep it closed so the page fits one screen.

const ICONS: Record<FairKeySpecKind, LucideIcon> = {
  range: Route,
  battery: BatteryCharging,
  power: Zap,
  charging: PlugZap,
  speed: Gauge,
  acceleration: Timer,
  torque: Settings2,
  other: SlidersHorizontal,
};

type Group = { id: string; label: string; items: Array<{ id: string; label: string; value: string }> };

function shortLabel(spec: FairKeySpec, dict: FairModelDict) {
  const labels: Partial<Record<FairKeySpecKind, string>> = {
    range: dict.keySpecRange,
    battery: dict.keySpecBattery,
    power: dict.keySpecPower,
    charging: dict.keySpecCharging,
    speed: dict.keySpecSpeed,
    acceleration: dict.keySpecAcceleration,
    torque: dict.keySpecTorque,
  };
  return labels[spec.kind] ?? spec.label;
}

export function ModelSpecsCard({
  keySpecs,
  groups,
  description,
  defaultOpen,
  dict,
}: {
  keySpecs: FairKeySpec[];
  groups: Group[];
  description?: string;
  defaultOpen: boolean;
  dict: FairModelDict;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const count = groups.reduce((sum, group) => sum + group.items.length, 0);
  const hasList = count > 0 || Boolean(description);
  if (keySpecs.length === 0 && !hasList) return null;

  return (
    <section className="fair-specs" data-open={open} aria-label={dict.keySpecsAria}>
      {keySpecs.length > 0 ? (
        <div className="fair-specs__keys" style={{ "--fair-key-count": keySpecs.length } as React.CSSProperties}>
          {keySpecs.map((spec) => {
            const Icon = ICONS[spec.kind];
            return (
              <div key={spec.id} className="fair-specs__key">
                <Icon aria-hidden="true" />
                <strong data-long={spec.unit === "" && spec.value.length > 6 ? "true" : undefined}>
                  {spec.value}
                  {spec.unit ? <i>{spec.unit}</i> : null}
                </strong>
                <span>
                  {shortLabel(spec, dict)}
                  {spec.qualifier ? <small>{spec.qualifier}</small> : null}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}

      {hasList ? (
        <>
          <button
            type="button"
            className="fair-specs__toggle"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setOpen((value) => !value)}
          >
            <FileText aria-hidden="true" />
            <span className="fair-specs__toggle-label">
              {description ? dict.specsToggleWithDescription : dict.specsToggle}
              {count > 0 ? <span className="fair-specs__count"> · {count}</span> : null}
            </span>
            <ChevronDown className="fair-specs__chevron" aria-hidden="true" />
          </button>
          <div className="fair-specs__drop" id={bodyId} inert={!open}>
            <div className="fair-specs__drop-inner">
              <div className="fair-specs__list">
                {groups.map((group) => (
                  <section key={group.id}>
                    <h2>{group.label}</h2>
                    <dl>
                      {group.items.map((item) => (
                        <div key={item.id}>
                          <dt>{item.label}</dt>
                          <dd>{item.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ))}
                {description ? (
                  <section>
                    <h2>{dict.specsDescription}</h2>
                    <p>{description}</p>
                  </section>
                ) : null}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
