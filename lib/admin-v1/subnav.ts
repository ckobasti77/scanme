// Admin UX A2 — the shape AdminSubnav renders (section bar on the phone,
// sidebar from lg). Counts and urgency badges are slots; A10 fills them.

export type AdminUrgencyTone = "hitno" | "uskoro" | "info";

export type AdminSubnavItem = {
  id: string;
  href: string;
  label: string;
  /** This exact page is open (`aria-current="page"`). */
  active: boolean;
  /** A child page is open; the parent is highlighted without aria-current. */
  activeChild?: boolean;
  count?: number;
  urgency?: { tone: AdminUrgencyTone; count: number };
  children?: AdminSubnavItem[];
};

export type AdminSubnavGroup = { id: string; label?: string; items: AdminSubnavItem[] };
