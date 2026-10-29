// The ONE shared schema file. The manifest's operations[].input (scripts/agentvillage.ts) and the MCP
// tools/list inputSchema (src/mcp.ts) are both serialized from OPERATIONS below, so they cannot drift.
import { FAVOR_IDS, SLOT_IDS } from "./menu";
import type { JsonSchema } from "./validate";

export const LOOP_ID_PATTERN = "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$";
export const HANDLE_PATTERN = "^@?[A-Za-z0-9_]{5,32}$";

const noArguments = (): JsonSchema => ({ type: "object", properties: {}, additionalProperties: false });
const favorList = (maxItems: number, minItems?: number): JsonSchema => ({
  type: "array",
  ...(minItems === undefined ? {} : { minItems }),
  maxItems,
  uniqueItems: true,
  items: { type: "string", enum: [...FAVOR_IDS] },
});
const loopId = (): JsonSchema => ({ type: "string", pattern: LOOP_ID_PATTERN });

export const JOIN_INPUT: JsonSchema = {
  type: "object",
  properties: {
    offers: favorList(3, 1),
    wants: favorList(3),
    giftOnly: { type: "boolean" },
    contactHandle: { type: "string", pattern: HANDLE_PATTERN },
    availability: { type: "array", maxItems: 4, uniqueItems: true, items: { type: "string", enum: [...SLOT_IDS] } },
  },
  required: ["offers"],
  additionalProperties: false,
};

export type Operation = {
  name: string;
  class: "read" | "write";
  tool: string;
  /** Public tools need no app token and no resident reference. */
  public: boolean;
  description: string;
  input: JsonSchema;
};

export const OPERATIONS: readonly Operation[] = [
  {
    name: "favorloop.how_it_works",
    class: "read",
    tool: "how_it_works",
    public: true,
    description: "How Favor Loop works: 15-minute favors traded in swaps, three-way loops and gift chains, three yeses, receiver confirmation and the privacy promises.",
    input: noArguments(),
  },
  {
    name: "favorloop.menu",
    class: "read",
    tool: "menu",
    public: true,
    description: "The fixed menu of 12 favor ids (about 15 minutes each, free) and the availability slot ids.",
    input: noArguments(),
  },
  {
    name: "favorloop.board",
    class: "read",
    tool: "board",
    public: true,
    description: "The anonymous board: counts and recent loops (shape, favor ids, status). No names or handles.",
    input: {
      type: "object",
      properties: { limit: { type: "integer", minimum: 1, maximum: 20, default: 10 } },
      additionalProperties: false,
    },
  },
  {
    name: "favorloop.join",
    class: "write",
    tool: "join",
    public: false,
    description: "Join Favor Loop, or replace your choices: 1 to 3 favor ids you can give, 0 to 3 you would like (at least 1 unless giftOnly), an optional Telegram handle shown only inside loops you accept, and optional availability.",
    input: JOIN_INPUT,
  },
  {
    name: "favorloop.my_loops",
    class: "read",
    tool: "my_loops",
    public: false,
    description: "Your saved choices and your loops: who gives what to whom, the status, and contacts once everyone said yes.",
    input: noArguments(),
  },
  {
    name: "favorloop.answer",
    class: "write",
    tool: "answer",
    public: false,
    description: "Say yes or no to a proposed loop. A no is never shown to the others.",
    input: {
      type: "object",
      properties: { loopId: loopId(), decision: { type: "string", enum: ["yes", "no"] } },
      required: ["loopId", "decision"],
      additionalProperties: false,
    },
  },
  {
    name: "favorloop.confirm",
    class: "write",
    tool: "confirm",
    public: false,
    description: "Confirm whether you received your favor in an accepted loop. Only the person who received a favor can confirm it.",
    input: {
      type: "object",
      properties: { loopId: loopId(), received: { type: "boolean" } },
      required: ["loopId", "received"],
      additionalProperties: false,
    },
  },
  {
    name: "favorloop.leave",
    class: "write",
    tool: "leave",
    public: false,
    description: "Leave Favor Loop: delete everything Favor Loop holds about you and dissolve your open loops.",
    input: noArguments(),
  },
];

export const operationByTool = (tool: string) => OPERATIONS.find(op => op.tool === tool);
export const operationByName = (name: string) => OPERATIONS.find(op => op.name === name);
