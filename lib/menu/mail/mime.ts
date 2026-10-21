// ScanMe Menu V1 (K26) — plain-text e-mail builder (RFC 5322 / 2045 / 2047) for the Gmail API `raw` field.
// Web APIs only (TextEncoder, btoa). Header values with line breaks are refused (header injection).

export class MailHeaderError extends Error {
  constructor() {
    super("mail_header_invalid");
    this.name = "MailHeaderError";
  }
}

export function hasLineBreak(value: string): boolean {
  return /[\r\n\u2028\u2029]/.test(value);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function utf8ToBase64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text));
}

export function base64Url(text: string): string {
  return utf8ToBase64(text)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// "=?UTF-8?B?" + "?=" take 12 of the 75 allowed characters, so 63 base64 characters = 45 bytes
const MAX_WORD_BYTES = 45;

export function encodeHeaderWord(value: string): string {
  if (hasLineBreak(value)) throw new MailHeaderError();
  if (/^[\x20-\x7E]*$/.test(value)) return value;

  const encoder = new TextEncoder();
  const words: string[] = [];
  let current = "";
  let currentBytes = 0;
  // Split by code points so a multi-byte sequence is never cut
  for (const ch of value) {
    const size = encoder.encode(ch).length;
    if (currentBytes + size > MAX_WORD_BYTES) {
      words.push(`=?UTF-8?B?${utf8ToBase64(current)}?=`);
      current = "";
      currentBytes = 0;
    }
    current += ch;
    currentBytes += size;
  }
  if (current) words.push(`=?UTF-8?B?${utf8ToBase64(current)}?=`);
  return words.join("\r\n ");
}

const EMAIL_PATTERN = /^[^\s<>"(),;:\\[\]@]+@[^\s<>"(),;:\\[\]@]+$/;

export function formatAddress(email: string, name?: string | null): string {
  if (hasLineBreak(email) || !EMAIL_PATTERN.test(email)) {
    throw new MailHeaderError();
  }
  if (!name) return email;
  if (hasLineBreak(name)) throw new MailHeaderError();
  if (/^[\x20-\x7E]*$/.test(name)) {
    return `"${name.replace(/[\\"]/g, "\\$&")}" <${email}>`;
  }
  return `${encodeHeaderWord(name)} <${email}>`;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function two(n: number): string {
  return String(n).padStart(2, "0");
}

// RFC 5322 date, always UTC
function formatDate(date: Date): string {
  return (
    `${DAYS[date.getUTCDay()]}, ${two(date.getUTCDate())} ${MONTHS[date.getUTCMonth()]} ` +
    `${date.getUTCFullYear()} ${two(date.getUTCHours())}:${two(date.getUTCMinutes())}:${two(date.getUTCSeconds())} +0000`
  );
}

export function buildMimeMessage(args: {
  from: string;
  fromName?: string | null;
  to: string;
  subject: string;
  body: string;
  date: Date;
  messageId?: string;
}): string {
  const headers = [
    `From: ${formatAddress(args.from, args.fromName)}`,
    `To: ${formatAddress(args.to)}`,
    `Subject: ${encodeHeaderWord(args.subject)}`,
    `Date: ${formatDate(args.date)}`,
  ];
  if (args.messageId !== undefined) {
    if (!/^<[^\s<>]+@[^\s<>]+>$/.test(args.messageId)) {
      throw new MailHeaderError();
    }
    headers.push(`Message-ID: ${args.messageId}`);
  }
  headers.push(
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
  );

  const encoded = utf8ToBase64(args.body.replace(/\r\n|\r|\n/g, "\r\n"));
  let body = "";
  for (let i = 0; i < encoded.length; i += 76) {
    body += encoded.slice(i, i + 76) + "\r\n";
  }
  return headers.join("\r\n") + "\r\n\r\n" + body;
}

export function gmailRawMessage(
  args: Parameters<typeof buildMimeMessage>[0],
): string {
  return base64Url(buildMimeMessage(args));
}
