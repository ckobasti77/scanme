// ADMIN v2 — one form for the browser title of every admin page: „Naziv | ScanMe Admin“.
// Pages and dev previews call `adminTitle(name)`; the test in `titles.test.ts`
// reads the pages and fails when one has no title or a title of another form.

export const ADMIN_TITLE_SUFFIX = "ScanMe Admin";

export function adminTitle(name: string): string {
  return `${name} | ${ADMIN_TITLE_SUFFIX}`;
}
