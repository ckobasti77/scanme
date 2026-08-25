import type { ConsentDict } from "../types";

// Versioned upload-consent notice (§2.10). Empty-but-typed: the upload screen
// does not exist yet (TASK-10+). The consent text and its version are added when
// the screen is built — inventing legal copy now would be wrong.
export const consentSr = {} as const satisfies ConsentDict;
