// ScanMe Menu V1 (K26) — tests for the PKCE helpers.
import { describe, expect, test } from "vitest";
import {
  PKCE_VERIFIER_LENGTH,
  base64UrlFromBytes,
  codeChallengeS256,
  isCodeVerifier,
  newCodeVerifier,
} from "./pkce";

describe("codeChallengeS256", () => {
  test("matches the RFC 7636 Appendix B vector", async () => {
    const challenge = await codeChallengeS256(
      "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
    );
    expect(challenge).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  test("has no padding", async () => {
    const challenge = await codeChallengeS256(newCodeVerifier());
    expect(challenge).toMatch(/^[A-Za-z0-9\-_]{43}$/);
  });
});

describe("newCodeVerifier", () => {
  test("is exactly 64 url-safe characters", () => {
    const verifier = newCodeVerifier();
    expect(verifier).toHaveLength(PKCE_VERIFIER_LENGTH);
    expect(verifier).toMatch(/^[A-Za-z0-9\-_]{64}$/);
    expect(isCodeVerifier(verifier)).toBe(true);
  });

  test("two calls differ", () => {
    expect(newCodeVerifier()).not.toBe(newCodeVerifier());
  });
});

describe("isCodeVerifier", () => {
  test("enforces the 43..128 length bounds", () => {
    expect(isCodeVerifier("a".repeat(42))).toBe(false);
    expect(isCodeVerifier("a".repeat(43))).toBe(true);
    expect(isCodeVerifier("a".repeat(128))).toBe(true);
    expect(isCodeVerifier("a".repeat(129))).toBe(false);
  });

  test("allows the unreserved set and rejects other characters", () => {
    expect(isCodeVerifier("a-._~".repeat(10))).toBe(true);
    expect(isCodeVerifier("a".repeat(42) + " ")).toBe(false);
    expect(isCodeVerifier("a".repeat(42) + "+")).toBe(false);
    expect(isCodeVerifier("a".repeat(42) + "=")).toBe(false);
    expect(isCodeVerifier("a".repeat(42) + "č")).toBe(false);
  });
});

describe("base64UrlFromBytes", () => {
  test("uses - and _ and drops padding", () => {
    expect(base64UrlFromBytes(new Uint8Array([0xfb, 0xff, 0xfe]))).toBe("-__-");
    expect(base64UrlFromBytes(new Uint8Array([0x61]))).toBe("YQ");
  });
});
