#!/usr/bin/env bun
// The two other test accounts of the agent demo (the spec's B and C), so a loop forms when the agent's owner
// (A: code review, wants a portrait) joins. They call Favor Loop exactly as the app server would, with
// FAVORLOOP_TEST_KEY: set it to the server's FAVORLOOP_DEMO_KEY so they live in the isolated test village and
// are never counted as real residents.
//
//   bun scripts/demo-accounts.ts seed      join both test accounts
//   bun scripts/demo-accounts.ts yes       both say yes to their proposed loop
//   bun scripts/demo-accounts.ts confirm   both confirm the favor they received
//   bun scripts/demo-accounts.ts status    what each one sees
//   bun scripts/demo-accounts.ts leave     delete both
//
// FAVORLOOP_MCP_URL defaults to http://localhost:8080/mcp. DEMO_HANDLE_B / DEMO_HANDLE_C optionally give them
// Telegram handles to reveal (use handles you own: a made-up one may belong to a stranger).
export {};

const ENDPOINT = process.env.FAVORLOOP_MCP_URL || "http://localhost:8080/mcp";
const KEY = process.env.FAVORLOOP_TEST_KEY ?? "";
const ACCOUNTS = [
  { subject: "demo-resident-2", label: "test account B", join: { offers: ["portrait_photo"], wants: ["stretch_session"], availability: ["fri_morning"] }, handle: process.env.DEMO_HANDLE_B },
  { subject: "demo-resident-3", label: "test account C", join: { offers: ["stretch_session"], wants: ["code_review"], availability: ["fri_morning"] }, handle: process.env.DEMO_HANDLE_C },
];

async function call(subject: string, tool: string, args: Record<string, unknown> = {}) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    redirect: "error",
    headers: { "content-type": "application/json", authorization: `Bearer ${KEY}`, "x-village-subject": subject },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool, arguments: args } }),
  });
  const body = (await res.json()) as { result?: { structuredContent: any }; error?: { message: string } };
  if (!body.result) throw new Error(body.error?.message ?? `HTTP ${res.status}`);
  return body.result.structuredContent;
}

const openLoop = async (subject: string, status: string) =>
  ((await call(subject, "my_loops")).loops as { loopId: string; status: string }[]).find(l => l.status === status)?.loopId;

const command = process.argv[2];
for (const account of ACCOUNTS) {
  let out: any;
  switch (command) {
    case "seed":
      out = await call(account.subject, "join", { ...account.join, ...(account.handle ? { contactHandle: account.handle } : {}) });
      break;
    case "yes": {
      const loopId = await openLoop(account.subject, "proposed");
      out = loopId ? await call(account.subject, "answer", { loopId, decision: "yes" }) : { text: "no proposed loop" };
      break;
    }
    case "confirm": {
      const loopId = await openLoop(account.subject, "accepted");
      out = loopId ? await call(account.subject, "confirm", { loopId, received: true }) : { text: "no accepted loop" };
      break;
    }
    case "status":
      out = await call(account.subject, "my_loops");
      break;
    case "leave":
      out = await call(account.subject, "leave");
      break;
    default:
      console.error("usage: bun scripts/demo-accounts.ts seed | yes | confirm | status | leave");
      process.exit(2);
  }
  console.log(`${account.label}: ${out.text ?? out.detail ?? JSON.stringify(out)}`);
}
