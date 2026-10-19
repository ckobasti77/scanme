// Presek po dužini auta (A10, odluka E13): jedna ravan x = c sa normalom (−1, 0, 0) odseca levu (+X)
// polovinu, onu okrenutu početnoj kameri. Ravan dele svi materijali delova i ivice izbora; pod i
// senka se ne seku. Vrednost t ∈ [0, 1] pomera c od spoljne ivice auta (ništa nije presečeno) do
// sredine (x = 0). Spoljna ivica prati rasklapanje, pa t = 0,5 seče na pola širine i u rasklopljenom autu.

import { Plane, Vector3 } from "three";

/** Daleko van scene: ništa se ne odseca, a traka ivice preseka se ne vidi. */
const OFF = 1e4;

export class Section {
  readonly plane = new Plane(new Vector3(-1, 0, 0), OFF);
  /** Da li je presek uključen (i dok se ravan vraća napolje). */
  on = false;
  /** Trenutni napredak preseka 0–1 (animira se). */
  t = 0;
  private extent = 1.1;

  /** Najveće x auta u trenutnom rasklapanju (+1 cm). */
  setExtent(maxX: number) {
    this.extent = Math.max(0.05, maxX + 0.01);
    this.apply();
  }

  set(t: number, on: boolean) {
    this.t = Math.min(1, Math.max(0, t));
    this.on = on;
    this.apply();
  }

  /** x ravni preseka, ili null kad je presek isključen (za picking). */
  get x(): number | null {
    return this.on ? this.plane.constant : null;
  }

  private apply() {
    this.plane.constant = this.on ? (1 - this.t) * this.extent : OFF;
  }
}
