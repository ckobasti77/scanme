"use server";

// ScanMe Menu V1 (K21) — the guest's buttons on the public menu as Server
// Actions (master §8.1–§8.4). Wiring only: the rules live in
// lib/menu/http/guest-actions.ts and in convex/menuGuest.ts. The action POSTs
// to the menu page it is called from, so the HttpOnly guest cookies
// (Path=/{slug}/meni) arrive here and the tokens never reach the browser's
// JavaScript; the IP is hashed here (the resolver's salted hash).

import { cookies, headers } from "next/headers";
import { fetchMutation } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { resolverIpHash } from "@/lib/card-resolver-http";
import {
  callWaiterAction,
  cancelRequestAction,
  requestBillAction,
  submitOrderAction,
  type GuestActionDeps,
  type GuestActionResult,
  type GuestCancelResult,
} from "@/lib/menu/http/guest-actions";
import { menuGatewayArg } from "@/lib/menu/http/gateway";

async function deps(): Promise<GuestActionDeps> {
  const jar = await cookies();
  const request = new Request("https://scanme.local/", { headers: await headers() });
  return {
    cookie: (name) => jar.get(name)?.value,
    secret: process.env.SCANME_GUEST_SECRET || null,
    ipHash: resolverIpHash(request),
    // Only the kind of failure reaches the log, never the guest's tokens or cart.
    onError: (error) =>
      console.error("MENU_GUEST_ACTION_FAILED", error instanceof Error ? error.name : typeof error),
    convex: {
      callWaiter: (args) => fetchMutation(api.menuGuest.callWaiter, { ...args, ...menuGatewayArg() }),
      requestBill: (args) => fetchMutation(api.menuGuest.requestBill, { ...args, ...menuGatewayArg() }),
      submitOrder: (args) => fetchMutation(api.menuGuest.submitOrder, { ...args, ...menuGatewayArg() }),
      cancelRequest: (args) => fetchMutation(api.menuGuest.cancelRequest, { ...args, ...menuGatewayArg() }),
    },
  };
}

export async function pozoviKonobara(slug: string): Promise<GuestActionResult> {
  return await callWaiterAction(slug, await deps());
}

export async function zatraziRacun(slug: string, nacin: "cash" | "card"): Promise<GuestActionResult> {
  return await requestBillAction(slug, nacin, await deps());
}

export async function posaljiPorudzbinu(slug: string, porudzbina: unknown): Promise<GuestActionResult> {
  return await submitOrderAction(slug, porudzbina, await deps());
}

export async function otkaziZahtev(slug: string, requestId: string): Promise<GuestCancelResult> {
  return await cancelRequestAction(slug, requestId, await deps());
}
