import { describe, expect, test } from "bun:test";
import { OPERATIONS } from "../src/schemas";
import { findIdentityKey, validate } from "../src/validate";

const schemaOf = (tool: string) => OPERATIONS.find(op => op.tool === tool)!.input;

describe("identity keys", () => {
  test("are found in any spelling or case, at any depth", () => {
    expect(findIdentityKey({ residentId: "x" })).toBe("residentId");
    expect(findIdentityKey({ offers: ["code_review"], extra: { User_ID: 1 } })).toBe("User_ID");
    expect(findIdentityKey({ a: [{ b: [{ "telegram-id": 5 }] }] })).toBe("telegram-id");
    expect(findIdentityKey({ SUBJECT: "x" })).toBe("SUBJECT");
    expect(findIdentityKey({ user_name: "x" })).toBe("user_name");
    expect(findIdentityKey({ "X-Village-Subject": "x" })).toBe("X-Village-Subject");
    expect(findIdentityKey({ offers: ["code_review"], contactHandle: "@someone" })).toBeNull();
  });
});

describe("validate", () => {
  test("accepts a correct join", () => {
    expect(validate(schemaOf("join"), { offers: ["code_review"], wants: ["portrait_photo"], giftOnly: false, availability: ["fri_morning"] })).toBeNull();
  });
  test("refuses unknown fields, including names on Object.prototype", () => {
    expect(validate(schemaOf("join"), { offers: ["code_review"], toString: 1 })).toContain("not a field");
    expect(validate(schemaOf("my_loops"), { constructor: {} })).toContain("not a field");
    expect(validate(schemaOf("my_loops"), [])).toBe("The arguments must be an object.");
  });
  test("checks lists, enums, patterns and integers", () => {
    expect(validate(schemaOf("join"), { offers: [] })).toBe("offers needs at least 1 item.");
    expect(validate(schemaOf("join"), { offers: ["code_review", "code_review"] })).toBe("offers lists the same item twice.");
    expect(validate(schemaOf("join"), { offers: ["massage"] })).toBe("offers[0] must be one of the menu ids (see favorloop.menu).");
    expect(validate(schemaOf("join"), { offers: ["code_review"], contactHandle: "@abc" })).toContain("Telegram handle");
    expect(validate(schemaOf("answer"), { loopId: "not-a-uuid", decision: "yes" })).toBe("loopId must be a loopId that my_loops returned.");
    expect(validate(schemaOf("answer"), { loopId: "00000000-0000-4000-8000-000000000001", decision: "maybe" })).toBe("decision must be one of: yes, no.");
    expect(validate(schemaOf("confirm"), { loopId: "00000000-0000-4000-8000-000000000001" })).toBe("received is required.");
    expect(validate(schemaOf("board"), { limit: 0 })).toBe("limit must be from 1 to 20.");
    expect(validate(schemaOf("board"), { limit: 2.5 })).toBe("limit must be a whole number.");
    expect(validate(schemaOf("board"), {})).toBeNull();
  });
  test("every object schema is closed", () => {
    const closed = (s: any): boolean => s.type !== "object" || (s.additionalProperties === false && Object.values(s.properties ?? {}).every(closed));
    for (const op of OPERATIONS) expect(closed(op.input)).toBe(true);
  });
});
