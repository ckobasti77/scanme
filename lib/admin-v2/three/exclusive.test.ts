import { describe, expect, test } from "vitest";
import { runningStages, type StageEntry } from "./exclusive";

const plain = (id: number): StageEntry => ({ id, exclusive: false });
const exclusive = (id: number): StageEntry => ({ id, exclusive: true });
const ids = (entries: readonly StageEntry[]) => [...runningStages(entries)].sort((a, b) => a - b);

describe("runningStages", () => {
  test("no stages: nothing runs", () => {
    expect(ids([])).toEqual([]);
  });

  test("no exclusive stage: all of them run", () => {
    expect(ids([plain(1), plain(2)])).toEqual([1, 2]);
  });

  test("one exclusive stage: only it runs", () => {
    expect(ids([plain(1), exclusive(2), plain(3)])).toEqual([2]);
    expect(ids([exclusive(1)])).toEqual([1]);
  });

  test("two exclusive stages: only the newer runs", () => {
    expect(ids([plain(1), exclusive(2), exclusive(3)])).toEqual([3]);
  });

  test("the newer exclusive stage is disposed: the older one runs again", () => {
    const alive = [plain(1), exclusive(2), exclusive(3)];
    expect(ids(alive)).toEqual([3]);
    expect(ids(alive.filter((entry) => entry.id !== 3))).toEqual([2]);
  });

  test("a plain stage created while an exclusive one lives is paused", () => {
    expect(ids([exclusive(1), plain(2)])).toEqual([1]);
  });

  test("the last exclusive stage is disposed: all of them run", () => {
    const alive = [plain(1), exclusive(2), plain(3)];
    expect(ids(alive.filter((entry) => entry.id !== 2))).toEqual([1, 3]);
  });

  test("the order of the list says which exclusive stage is newer, not the number of its id", () => {
    expect(ids([exclusive(9), exclusive(4)])).toEqual([4]);
  });
});
