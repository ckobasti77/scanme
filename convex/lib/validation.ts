import { ConvexError } from "convex/values";

const RESERVED_SLUGS = new Set(["admin", "api", "icon"]);

export function requireText(
  value: string,
  label: string,
  minLength: number,
  maxLength: number,
) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < minLength || normalized.length > maxLength) {
    throw new ConvexError(`${label} mora imati između ${minLength} i ${maxLength} karaktera.`);
  }
  return normalized;
}

export function optionalText(value: string | undefined, maxLength: number) {
  const normalized = value?.trim().replace(/\s+/g, " ");
  if (!normalized) return undefined;
  if (normalized.length > maxLength) {
    throw new ConvexError(`Polje može imati najviše ${maxLength} karaktera.`);
  }
  return normalized;
}

export function isSafeGoogleReviewDestination(value: string) {
  return isSafePublicDestination(value);
}

export function isSafePublicDestination(value: string) {
  try {
    if (value.length > 2048) return false;
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443")
    ) {
      return false;
    }

    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname === "0.0.0.0" ||
      hostname === "::" ||
      hostname === "::1"
    ) {
      return false;
    }

    const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4) {
      const octets = ipv4.slice(1).map(Number);
      if (octets.some((octet) => octet > 255)) return false;
      if (
        octets[0] === 10 ||
        octets[0] === 127 ||
        octets[0] === 0 ||
        (octets[0] === 169 && octets[1] === 254) ||
        (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
        (octets[0] === 192 && octets[1] === 168)
      ) {
        return false;
      }
    }

    if (hostname.includes(":")) {
      const compact = hostname.toLowerCase();
      if (compact.startsWith("fc") || compact.startsWith("fd") || compact.startsWith("fe8") || compact.startsWith("fe9") || compact.startsWith("fea") || compact.startsWith("feb")) {
        return false;
      }
    }

    return hostname.includes(".");
  } catch {
    return false;
  }
}

export function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ConvexError("Email adresa nije ispravna.");
  }
  return email;
}

export function normalizePhone(value: string) {
  const phone = value.trim().replace(/\s+/g, " ");
  const digitCount = (phone.match(/\d/g) ?? []).length;
  if (
    phone.length > 40 ||
    digitCount < 7 ||
    digitCount > 15 ||
    !/^\+?[0-9\s().-]+$/.test(phone)
  ) {
    throw new ConvexError(
      "Telefon mora biti u formatu sa 7–15 cifara; dozvoljeni su početni +, razmak, zagrade i crtica.",
    );
  }
  return phone;
}

export function requireSlug(value: string) {
  const slug = value.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) {
    throw new ConvexError(
      "QR slug mora biti u formatu: mala slova a-z, cifre 0-9 i crtice između reči, bez razmaka ili crtice na početku/kraju (npr. naziv-lokala), najviše 80 karaktera.",
    );
  }
  if (RESERVED_SLUGS.has(slug)) {
    throw new ConvexError("Ova QR oznaka je rezervisana za ScanMe sistem.");
  }
  return slug;
}
