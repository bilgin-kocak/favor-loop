import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { OPERATIONS } from "../src/schemas";

const dir = new URL("../agentvillage/", import.meta.url).pathname;
const raw = readFileSync(`${dir}mini-apps/favorloop/manifest.json`, "utf8");
const manifest = JSON.parse(raw);

describe("the agentvillage pull request files", () => {
  test("the manifest is canonical JSON", () => {
    expect(raw).toBe(`${JSON.stringify(manifest, null, 2)}\n`);
  });
  test("every operation's input is the shared schema, byte for byte (rerun bun run agentvillage if not)", () => {
    expect(manifest.operations.map((op: any) => op.name)).toEqual(OPERATIONS.map(op => op.name));
    for (const op of OPERATIONS) {
      const entry = manifest.operations.find((o: any) => o.name === op.name);
      expect(entry.class).toBe(op.class);
      expect(entry.target).toEqual({ tool: op.tool });
      expect(JSON.stringify(entry.input)).toBe(JSON.stringify(op.input));
    }
  });
  test("the skill pin matches SKILL.md, and SKILL.md is plain ASCII", () => {
    const skill = readFileSync(`${dir}skills/favorloop/SKILL.md`);
    expect(manifest.skills[0].sha256).toBe(createHash("sha256").update(skill).digest("hex"));
    expect([...skill].every(byte => byte < 128)).toBe(true);
    expect(manifest.owner).toEqual({ github: "bilgin-kocak" });
  });
});
