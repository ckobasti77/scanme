// ScanMe Menu V1 (K29) — the device class of an analytics event, from the
// User-Agent header only (coarse, like the card resolver; nothing else about
// the device is read or kept). `null` = do not record: no User-Agent, or a
// bot, a link preview or a headless browser.

import type { Uredjaj } from "./definicije";

const BOT = /bot|crawler|spider|preview|facebookexternalhit|whatsapp|headless|lighthouse/;

export function klasaUredjaja(userAgent: string | null | undefined): Uredjaj | null {
  const value = userAgent?.trim().toLowerCase() ?? "";
  if (!value || BOT.test(value)) return null;
  if (/ipad|tablet/.test(value) || (value.includes("android") && !value.includes("mobile"))) return "tablet";
  if (/mobile|iphone|ipod|android/.test(value)) return "telefon";
  return "racunar";
}
