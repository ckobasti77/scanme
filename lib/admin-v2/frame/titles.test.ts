import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, test } from "vitest";
import { ADMIN_NAV_ITEMS } from "@/lib/admin-v1/navigation";
import { adminTitle } from "./titles";

const ROOT = process.cwd();

function pagesUnder(dir: string, name: "page.tsx" | "layout.tsx"): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...pagesUnder(full, name));
    else if (entry === name) out.push(full);
  }
  return out;
}

const rel = (file: string) => relative(ROOT, file).split(sep).join("/");

/** A page that only redirects renders nothing, so its title is the target's. */
function redirectOnly(source: string) {
  return /\bredirect\(/.test(source) && !/from "@\/components\//.test(source);
}

const hasTitle = (source: string) => /export const metadata|export async function generateMetadata|export function generateMetadata/.test(source);
const titleForm = (source: string) => /adminTitle\(|\| ScanMe Admin|`\$\{[^}]+\} \| ScanMe Admin`/.test(source);

describe("adminTitle", () => {
  test("has one form: Naziv | ScanMe Admin", () => {
    expect(adminTitle("Zadaci")).toBe("Zadaci | ScanMe Admin");
    expect(adminTitle("Finansije")).toBe("Finansije | ScanMe Admin");
  });
});

describe("admin page titles", () => {
  const adminPages = pagesUnder(join(ROOT, "app/admin"), "page.tsx");

  test("every admin page that renders has a title of the form Naziv | ScanMe Admin", () => {
    const rendering = adminPages.filter((file) => !redirectOnly(readFileSync(file, "utf8")));
    expect(rendering.length).toBeGreaterThan(15);
    const without = rendering.filter((file) => {
      const source = readFileSync(file, "utf8");
      return !(hasTitle(source) && titleForm(source));
    });
    expect(without.map(rel)).toEqual([]);
  });

  test("the pages that had the public site title now have their own", () => {
    for (const file of ["app/admin/finansije/page.tsx", "app/admin/podesavanja/page.tsx", "app/admin/login/page.tsx"]) {
      const source = readFileSync(join(ROOT, file), "utf8");
      expect(hasTitle(source), file).toBe(true);
      expect(source, file).toContain("adminTitle(");
    }
  });

  test("every page in the navigation is a page with a title", () => {
    const hrefs = ADMIN_NAV_ITEMS.flatMap((item) => [item.href, ...(item.children ?? []).map((child) => child.href)]);
    for (const href of new Set(hrefs)) {
      const file = join(ROOT, "app", href, "page.tsx");
      expect(existsSync(file), href).toBe(true);
      const source = readFileSync(file, "utf8");
      expect(hasTitle(source) && titleForm(source), href).toBe(true);
    }
  });

  test("the admin layout keeps a fallback title", () => {
    expect(readFileSync(join(ROOT, "app/admin/layout.tsx"), "utf8")).toContain('title: "ScanMe Admin"');
  });
});

describe("admin dev preview titles", () => {
  test("every admin dev preview has a title of the same form (page or layout)", () => {
    const dev = join(ROOT, "app/dev");
    const previews = readdirSync(dev).filter((name) => /^admin-.*-preview$/.test(name));
    expect(previews.length).toBeGreaterThan(12);
    const without = previews.filter((name) => {
      const files = [...pagesUnder(join(dev, name), "page.tsx"), ...pagesUnder(join(dev, name), "layout.tsx")].map((file) => readFileSync(file, "utf8"));
      return !files.some((source) => hasTitle(source) && titleForm(source));
    });
    expect(without).toEqual([]);
  });
});
