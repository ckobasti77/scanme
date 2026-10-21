"use server";

// The cancel link's form (master §11.7), without any client JavaScript: the
// page binds this action to its venue, token and language and posts it as a
// plain form. It cancels through the reservation Server Action, then goes
// back to the same link page, which says what happened (`?otkazano=1`, or
// `?neuspelo=<code>` when nothing was cancelled). The redirect stays on this
// venue's own path; the token never leaves the address of the page it is on.

import { redirect } from "next/navigation";
import { reservationLinkPath } from "@/lib/menu/http/reservation";
import { isMenuToken } from "@/lib/menu/tokens";
import { otkaziRezervacijuTokenom } from "../../_lib/radnje-rezervacije";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const JEZIK_PATTERN = /^[a-z]{2,8}(?:-[a-z0-9]{1,8})?$/i;

export async function otkaziIzLinka(slug: string, token: string, jezik: string | null): Promise<void> {
  // Only a venue's own link page is ever redirected to.
  if (!SLUG_PATTERN.test(slug) || slug.length > 80 || !isMenuToken(token)) redirect("/");
  const ishod = await otkaziRezervacijuTokenom(slug, token);
  const upit = new URLSearchParams();
  if (jezik && JEZIK_PATTERN.test(jezik)) upit.set("jezik", jezik);
  if (ishod.ok) upit.set("otkazano", "1");
  else upit.set("neuspelo", ishod.code);
  redirect(`${reservationLinkPath(slug, token)}?${upit.toString()}`);
}
