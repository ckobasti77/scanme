export const OFFER_LOGO_SESSION_KEY = "scanme-offer-logo-session";

export function getOrCreateOfferLogoSession(): string {
  const existing = window.sessionStorage.getItem(OFFER_LOGO_SESSION_KEY);
  if (existing && existing.length >= 32) return existing;
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  window.sessionStorage.setItem(OFFER_LOGO_SESSION_KEY, token);
  return token;
}

export function readOfferLogoSession(): string | null {
  return window.sessionStorage.getItem(OFFER_LOGO_SESSION_KEY);
}
