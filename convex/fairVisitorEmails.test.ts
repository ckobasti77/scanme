// Visitor confirmation emails, final copy of 9 Oct 2026 (Aleksa): exact
// subject, plain text and the HTML essentials of "Zainteresovan sam",
// "Probna vožnja" and a survey with a contact left.

import { describe, expect, test } from "vitest";
import { buildFairLeadEmail, fairFirstName, fairModelNameWithoutBrand, type FairLeadEmailMessage } from "./lib/fairEmails";

const BASE = "https://www.scanme.rs";
const message = (extra: Partial<FairLeadEmailMessage> = {}): FairLeadEmailMessage => ({
  kind: "immediate_confirmation",
  dedupeKey: "fair-lead/x/immediate_confirmation",
  recipient: "posetilac@example.invalid",
  leadKind: "interest",
  contactName: "Marko Marković",
  modelName: "EWIND",
  brandName: "JMEV",
  exhibitorName: "CUBI d.o.o.",
  eventTitle: "Sajam elektromobilnosti 2026",
  modelPath: "/sajam/elektromobilnost-2026/model/jmev-ewind",
  followUpScheduled: false,
  ...extra,
});

const FOOTER_MODEL =
  "Ovu poruku ste dobili jer ste na sajmu ostavili kontakt za JMEV EWIND. Vaše podatke dobija samo CUBI d.o.o. Saglasnost možete povući u svakom trenutku odgovorom na ovaj mejl. Politika privatnosti: https://www.scanme.rs/sajam/privatnost";
const CLOSING = "Pozdrav,\nScanMe tim, Sajam elektromobilnosti";

describe("visitor confirmation emails (9 Oct 2026)", () => {
  test("Zainteresovan sam", () => {
    const email = buildFairLeadEmail(message(), BASE);
    expect(email.subject).toBe("Zabeležili smo vaše interesovanje za JMEV EWIND");
    expect(email.text).toBe([
      "Zdravo Marko,\nhvala što ste na Sajmu elektromobilnosti pogledali JMEV EWIND. Vaše interesovanje smo prosledili JMEV timu. Javiće vam se sa ponudom i odgovorima na sva pitanja koja imate.",
      "Model i specifikacije možete ponovo da pogledate ovde: https://www.scanme.rs/sajam/elektromobilnost-2026/model/jmev-ewind",
      CLOSING,
      "—",
      FOOTER_MODEL,
    ].join("\n\n"));
    expect(email.html).toContain('<a href="https://www.scanme.rs/sajam/elektromobilnost-2026/model/jmev-ewind"');
    expect(email.html).toContain('<a href="https://www.scanme.rs/sajam/privatnost"');
  });

  test("Probna vožnja", () => {
    const email = buildFairLeadEmail(message({ leadKind: "test_drive" }), BASE);
    expect(email.subject).toBe("Zahtev za probnu vožnju: JMEV EWIND");
    expect(email.text).toBe([
      "Zdravo Marko,\nprimili smo vaš zahtev za probnu vožnju modela JMEV EWIND i prosledili ga JMEV timu. Kontaktiraće vas da zajedno dogovorite dan i vreme.",
      "Za vožnju ponesite vozačku dozvolu. Uživajte!",
      CLOSING,
      "—",
      FOOTER_MODEL,
    ].join("\n\n"));
  });

  test("survey with a contact left: survey text, footer with the brand only", () => {
    const email = buildFairLeadEmail(message({ origin: "survey" }), BASE);
    expect(email.subject).toBe("Hvala na odgovorima za JMEV");
    expect(email.text).toBe([
      "Zdravo Marko,\nhvala što ste odvojili minut za JMEV anketu. Vaši odgovori pomažu JMEV timu da bolje razume šta je posetiocima zaista važno.",
      "Pošto ste ostavili kontakt, JMEV tim vam može poslati ponudu za model koji vam se dopao.",
      CLOSING,
      "—",
      "Ovu poruku ste dobili jer ste na sajmu ostavili kontakt za JMEV. Vaše podatke dobija samo CUBI d.o.o. Saglasnost možete povući u svakom trenutku odgovorom na ovaj mejl. Politika privatnosti: https://www.scanme.rs/sajam/privatnost",
    ].join("\n\n"));
  });

  test("no name → \"Zdravo,\"; a model name that repeats the brand is not doubled", () => {
    expect(buildFairLeadEmail(message({ contactName: "" }), BASE).text.startsWith("Zdravo,\nhvala")).toBe(true);
    const mazda = buildFairLeadEmail(message({ brandName: "Mazda", modelName: "Mazda CX-5 Homura", exhibitorName: "Grand Motors d.o.o." }), BASE);
    expect(mazda.subject).toBe("Zabeležili smo vaše interesovanje za Mazda CX-5 Homura");
    expect(fairModelNameWithoutBrand("Yudo Air Ultra", "Yudo")).toBe("Air Ultra");
    expect(fairModelNameWithoutBrand("EWIND", "JMEV")).toBe("EWIND");
    expect(fairFirstName("  Ana  Petrović ")).toBe("Ana");
    expect(fairFirstName("Pozovite 0641234567")).toBeNull();
  });
});
