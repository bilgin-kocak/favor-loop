import { describe, expect, test } from "bun:test";
import { saltProblem } from "../src/config";

describe("config", () => {
  test("a missing or short HASH_SALT is a reason to refuse to start", () => {
    expect(saltProblem("")).toContain("not set");
    expect(saltProblem("favorloop-insecure-development-salt")).toContain("public development default");
    expect(saltProblem("a".repeat(31))).toContain("at least 32");
    expect(saltProblem("0123456789abcdef".repeat(4))).toBeNull();
  });
});
