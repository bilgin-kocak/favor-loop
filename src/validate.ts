// A small JSON Schema checker for exactly the keywords src/schemas.ts uses, plus the identity-key refusal.
// Messages are one plain sentence, safe to show to the resident.

export type JsonSchema = {
  type?: "object" | "array" | "string" | "integer" | "boolean";
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchema;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  enum?: string[];
  pattern?: string;
  minimum?: number;
  maximum?: number;
  default?: unknown;
};

const hasOwn = (o: object, key: string) => Object.prototype.hasOwnProperty.call(o, key);
export const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

// Keys that would name a resident. Agent Village identifies the caller; arguments never do.
const IDENTITY_KEYS = new Set(["residentid", "subject", "userid", "telegramid", "username", "xvillagesubject"]);
const normalKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The first key, at any depth, that names a resident (any spelling or case), or null. */
export function findIdentityKey(value: unknown, depth = 0): string | null {
  if (depth > 64) return null; // anything this deep fails the schema anyway
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = findIdentityKey(item, depth + 1);
      if (hit) return hit;
    }
  } else if (isPlainObject(value)) {
    for (const [key, inner] of Object.entries(value)) {
      if (IDENTITY_KEYS.has(normalKey(key))) return key;
      const hit = findIdentityKey(inner, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

/** A caller-supplied key, printable and short, for an error message. */
export function shownKey(key: string): string {
  const printable = key.replace(/[^\x20-\x7e]/g, "?");
  return JSON.stringify(printable.length > 40 ? `${printable.slice(0, 37)}...` : printable);
}

const FRIENDLY_PATTERN: Record<string, string> = {
  loopId: "loopId must be a loopId that my_loops returned.",
  contactHandle: "contactHandle must be a Telegram handle such as @name (5 to 32 letters, digits or underscores).",
};
const patterns = new Map<string, RegExp>();
const regex = (source: string) => {
  let re = patterns.get(source);
  if (!re) patterns.set(source, (re = new RegExp(source)));
  return re;
};

/** Null when value matches schema, else one sentence naming the first problem. */
export function validate(schema: JsonSchema, value: unknown, path = ""): string | null {
  const name = path || "The arguments";
  switch (schema.type) {
    case "object": {
      if (!isPlainObject(value)) return `${name} must be an object.`;
      const properties = schema.properties ?? {};
      if (schema.additionalProperties === false) {
        for (const key of Object.keys(value)) {
          if (!hasOwn(properties, key)) return `${shownKey(key)} is not a field Favor Loop accepts here.`;
        }
      }
      for (const key of schema.required ?? []) {
        if (!hasOwn(value, key)) return `${child(path, key)} is required.`;
      }
      for (const key of Object.keys(properties)) {
        if (!hasOwn(value, key)) continue;
        const problem = validate(properties[key], value[key], child(path, key));
        if (problem) return problem;
      }
      return null;
    }
    case "array": {
      if (!Array.isArray(value)) return `${name} must be a list.`;
      if (schema.minItems !== undefined && value.length < schema.minItems) {
        return `${name} needs at least ${schema.minItems} item${schema.minItems === 1 ? "" : "s"}.`;
      }
      if (schema.maxItems !== undefined && value.length > schema.maxItems) {
        return `${name} can have at most ${schema.maxItems} items.`;
      }
      if (schema.uniqueItems && new Set(value.map(item => JSON.stringify(item))).size !== value.length) {
        return `${name} lists the same item twice.`;
      }
      if (schema.items) {
        for (let i = 0; i < value.length; i++) {
          const problem = validate(schema.items, value[i], `${name}[${i}]`);
          if (problem) return problem;
        }
      }
      return null;
    }
    case "string": {
      if (typeof value !== "string") return `${name} must be text.`;
      if (schema.enum && !schema.enum.includes(value)) {
        return schema.enum.length > 6
          ? `${name} must be one of the menu ids (see favorloop.menu).`
          : `${name} must be one of: ${schema.enum.join(", ")}.`;
      }
      if (schema.pattern && !regex(schema.pattern).test(value)) {
        return FRIENDLY_PATTERN[lastSegment(path)] ?? `${name} is not in the expected format.`;
      }
      return null;
    }
    case "integer": {
      if (typeof value !== "number" || !Number.isInteger(value)) return `${name} must be a whole number.`;
      if ((schema.minimum !== undefined && value < schema.minimum) || (schema.maximum !== undefined && value > schema.maximum)) {
        return `${name} must be from ${schema.minimum} to ${schema.maximum}.`;
      }
      return null;
    }
    case "boolean":
      return typeof value === "boolean" ? null : `${name} must be true or false.`;
    default:
      return null;
  }
}

const child = (path: string, key: string) => (path ? `${path}.${key}` : key);
const lastSegment = (path: string) => path.slice(path.lastIndexOf(".") + 1);
