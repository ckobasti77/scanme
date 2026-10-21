// K34: the waiter's "Pozovi" link uses the run's one tel: rule (lib/menu/phone.ts): digits and a
// LEADING plus only. The reservation detail kept every "+" before.
import { describe, expect, test } from "vitest";
import { telHref } from "@/lib/menu/phone";
import { telefonHref } from "./rezervacije/detalj-rezervacije";

describe("K34: telefonHref follows telHref", () => {
  test("a plus inside the number is dropped, a leading one is kept", () => {
    expect(telefonHref("+381 60 000+0000")).toBe("tel:+381600000000");
    expect(telefonHref("060/000-0000")).toBe("tel:0600000000");
  });

  test("the same answer as telHref for every stored-looking number", () => {
    for (const broj of ["+381 60 000 0000", "060 000 0000", "(011) 000-000", "+381600000000"]) {
      expect(telefonHref(broj)).toBe(telHref(broj));
    }
  });
});
