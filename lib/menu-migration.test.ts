import { describe, expect, test } from "vitest";
import { belgradeLocalToEpoch } from "./belgrade-time";
import { isMigrationStage, MIGRATION_STAGES, migrationDeadline } from "./menu-migration";

const at = (local: string) => belgradeLocalToEpoch(local)!;

describe("menu migration deadline (2 working days, Belgrade)", () => {
  test("Friday → Tuesday, Thursday → Monday, Wednesday → Friday", () => {
    // 2026-09-04 is a Friday.
    expect(migrationDeadline(at("2026-09-04T10:00"))).toBe(at("2026-09-08T10:00"));
    expect(migrationDeadline(at("2026-09-03T15:30"))).toBe(at("2026-09-07T15:30"));
    expect(migrationDeadline(at("2026-09-02T09:00"))).toBe(at("2026-09-04T09:00"));
  });

  test("a weekend receipt counts from Monday", () => {
    // 2026-09-05 is a Saturday.
    expect(migrationDeadline(at("2026-09-05T12:00"))).toBe(at("2026-09-08T12:00"));
  });

  test("the stage union is the four §2.9 stages", () => {
    expect(MIGRATION_STAGES).toEqual(["received", "in_progress", "review", "published"]);
    expect(isMigrationStage("review")).toBe(true);
    expect(isMigrationStage("done")).toBe(false);
  });
});
