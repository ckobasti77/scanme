"use server";

// ScanMe Menu V1 (K25) — the guest's reservation form, the cancel link and
// "Moji zahtevi" as Server Actions (master §11.2, §11.7; plan K24-1). Wiring
// only: the rules live in lib/menu/http/reservation.ts and in
// convex/menuReservations.ts. The action POSTs to the menu page it is called
// from, so the HttpOnly device cookie (Path=/{slug}/meni) arrives here, a new
// one is set here, and the tokens never reach the browser's JavaScript —
// except the cancel token, returned once for the confirmation's link. Next
// checks the Origin; the IP is hashed here (the resolver's salted hash).

import { cookies, headers } from "next/headers";
import { fetchMutation } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { resolverIpHash } from "@/lib/card-resolver-http";
import {
  cancelReservationByDeviceAction,
  cancelReservationByTokenAction,
  submitReservationAction,
  type ReservationActionDeps,
  type ReservationCancelResult,
  type ReservationSendResult,
} from "@/lib/menu/http/reservation";
import { menuGatewayArg } from "@/lib/menu/http/gateway";

async function deps(): Promise<ReservationActionDeps> {
  const jar = await cookies();
  const request = new Request("https://scanme.local/", { headers: await headers() });
  return {
    cookie: (name) => jar.get(name)?.value,
    setCookie: (name, value, options) =>
      jar.set(name, value, { path: options.path, maxAge: options.maxAgeS, httpOnly: true, secure: true, sameSite: "lax" }),
    secret: process.env.SCANME_GUEST_SECRET || null,
    ipHash: resolverIpHash(request),
    // Only the kind of failure reaches the log, never the guest's data or tokens.
    onError: (error) =>
      console.error("MENU_RESERVATION_ACTION_FAILED", error instanceof Error ? error.name : typeof error),
    convex: {
      submit: (args) => fetchMutation(api.menuReservations.submit, { ...args, ...menuGatewayArg() }),
      cancelByToken: (args) => fetchMutation(api.menuReservations.cancelByToken, { ...args, ...menuGatewayArg() }),
      cancelByDevice: (args) => fetchMutation(api.menuReservations.cancelByDevice, { ...args, ...menuGatewayArg() }),
    },
  };
}

export async function posaljiRezervaciju(slug: string, unos: unknown): Promise<ReservationSendResult> {
  return await submitReservationAction(slug, unos, await deps());
}

export async function otkaziRezervacijuTokenom(slug: string, token: string): Promise<ReservationCancelResult> {
  return await cancelReservationByTokenAction(slug, token, await deps());
}

export async function otkaziRezervacijuSaUredjaja(slug: string, reservationId: string): Promise<ReservationCancelResult> {
  return await cancelReservationByDeviceAction(slug, reservationId, await deps());
}
