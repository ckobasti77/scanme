// K33 (security review B3): which IP bucket a public Menu call may use.

import { afterEach, describe, expect, test } from "vitest";
import { MENU_SHARED_IP_KEY, menuGatewayConfigured, menuIpKey } from "./menuGateway";

const IP = "0123456789abcdef0123456789abcdef";
const SECRET = "k33-unit-gateway-secret-0123456789abcdef";

afterEach(() => {
  delete process.env.MENU_GATEWAY_SECRET;
});

describe("menuIpKey", () => {
  test("without a configured secret the hash is trusted as before K33", () => {
    expect(menuGatewayConfigured()).toBe(false);
    expect(menuIpKey(IP, undefined)).toBe(IP);
    process.env.MENU_GATEWAY_SECRET = "too-short";
    expect(menuGatewayConfigured()).toBe(false);
    expect(menuIpKey(IP, undefined)).toBe(IP);
  });

  test("with the secret set, only a call that carries it keeps its own bucket", () => {
    process.env.MENU_GATEWAY_SECRET = SECRET;
    expect(menuGatewayConfigured()).toBe(true);
    expect(menuIpKey(IP, SECRET)).toBe(IP);
    expect(menuIpKey(IP, undefined)).toBe(MENU_SHARED_IP_KEY);
    expect(menuIpKey(IP, `${SECRET}x`)).toBe(MENU_SHARED_IP_KEY);
    expect(menuIpKey(IP, SECRET.replace("k", "K"))).toBe(MENU_SHARED_IP_KEY);
  });

  test("a missing or malformed hash is always the shared bucket", () => {
    for (const secret of [undefined, SECRET]) {
      if (secret) process.env.MENU_GATEWAY_SECRET = secret;
      for (const hash of [undefined, "", "not-hex", "ABCDEF0123456789ABCDEF0123456789", "ab"]) {
        expect(menuIpKey(hash, secret)).toBe(MENU_SHARED_IP_KEY);
      }
    }
  });
});
