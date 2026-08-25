import type { MemoriesDict } from "../types";

// Guest Memories copy (/m/[code]*). Empty-but-typed: no guest UI exists yet
// (TASK-10+). Keys are added when the screens are built.
export const memoriesSr = {} as const satisfies MemoriesDict;
