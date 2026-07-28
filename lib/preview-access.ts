import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const PREVIEW_COOKIE = "scanme-preview-access";
const PREVIEW_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

function getPreviewPasskey() {
  return process.env.SCANME_PREVIEW_PASSKEY?.trim() ?? "";
}

function previewAccessToken(passkey: string) {
  return createHmac("sha256", passkey)
    .update("scanme-preview-access:v1")
    .digest("base64url");
}

function valuesMatch(first: string, second: string) {
  const firstBuffer = Buffer.from(first);
  const secondBuffer = Buffer.from(second);
  return firstBuffer.length === secondBuffer.length && timingSafeEqual(firstBuffer, secondBuffer);
}

export function isValidPreviewPasskey(candidate: string) {
  const passkey = getPreviewPasskey();
  return passkey.length === 32 && candidate.length === 32 && valuesMatch(candidate, passkey);
}

export async function hasPreviewAccess() {
  const passkey = getPreviewPasskey();
  if (passkey.length !== 32) return false;

  const cookieValue = (await cookies()).get(PREVIEW_COOKIE)?.value ?? "";
  return valuesMatch(cookieValue, previewAccessToken(passkey));
}

export async function grantPreviewAccess() {
  const passkey = getPreviewPasskey();
  if (passkey.length !== 32) throw new Error("SCANME_PREVIEW_PASSKEY is not configured.");

  (await cookies()).set(PREVIEW_COOKIE, previewAccessToken(passkey), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PREVIEW_COOKIE_MAX_AGE,
  });
}
