// The Model Context Protocol, as much of it as a read-only tool server needs.
//
// The Claude connector (supabase/functions/mcp) speaks MCP over "Streamable
// HTTP": the client POSTs one JSON-RPC message, the server answers it in the
// response body. Stateless -- no session id, no server-to-client stream -- so
// every message here is answered on its own, which is all a set of read-only
// tools needs and all an edge function that can be killed between requests can
// honestly promise.
//
// No SDK. The protocol surface used is five methods; a dependency would be
// more code than this file, and this file is tested (mcpProtocol.test.ts)
// where an SDK's behaviour inside an edge function would not be.

// Newest first. A client asking for one of these gets it back; anything else
// gets the newest, and the client decides whether it can speak that.
export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];

export type ToolResult = {
  // What the model reads.
  text: string;
  // The same answer as data, for clients that read structured content.
  data?: unknown;
  // A failure the model should see and can act on ("this account has no
  // positions", "pass account_id"), as opposed to a protocol fault.
  isError?: boolean;
};

export type Tool<Ctx> = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (args: Record<string, unknown>, ctx: Ctx) => Promise<ToolResult>;
};

export type ServerInfo = { name: string; title: string; version: string };

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: any };

const error = (id: Rpc["id"], code: number, message: string) => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: { code, message }
});
const result = (id: Rpc["id"], value: unknown) => ({ jsonrpc: "2.0", id, result: value });

export function negotiateVersion(requested: unknown): string {
  return typeof requested === "string" && SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
    ? requested
    : SUPPORTED_PROTOCOL_VERSIONS[0];
}

// Every tool here is read-only, and says so in the hints clients use to decide
// whether to ask the user before calling it.
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export function describeTools<Ctx>(tools: Tool<Ctx>[]) {
  return tools.map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: t.inputSchema,
    annotations: { title: t.title, ...READ_ONLY }
  }));
}

// The arguments a tool declares as required, present and of the declared type.
// Enough checking to turn a malformed call into a sentence the model can fix,
// not a full JSON Schema validator.
export function checkArgs(schema: any, args: Record<string, unknown>): string | null {
  const props = schema?.properties || {};
  for (const key of schema?.required || []) {
    if (args[key] === undefined || args[key] === null || args[key] === "") return `${key} is required.`;
  }
  for (const [key, value] of Object.entries(args)) {
    const p = props[key];
    if (!p) {
      if (schema?.additionalProperties === false) return `${key} is not a parameter of this tool.`;
      continue;
    }
    if (value === undefined || value === null) continue;
    const want = p.type;
    const ok =
      want === "string" ? typeof value === "string"
      : want === "number" ? typeof value === "number" && Number.isFinite(value)
      : want === "integer" ? Number.isInteger(value)
      : want === "array" ? Array.isArray(value)
      : want === "boolean" ? typeof value === "boolean"
      : true;
    if (!ok) return `${key} must be ${want === "integer" ? "a whole number" : `a ${want}`}.`;
    if (p.enum && !p.enum.includes(value)) return `${key} must be one of: ${p.enum.join(", ")}.`;
  }
  return null;
}

// One JSON-RPC message in, its response out -- or null for a notification,
// which takes no response.
export async function handleMessage<Ctx>(
  msg: Rpc,
  opts: { tools: Tool<Ctx>[]; ctx: Ctx; server: ServerInfo; instructions: string }
): Promise<object | null> {
  if (!msg || typeof msg !== "object" || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return error(msg?.id, -32600, "Invalid request.");
  }
  const isNotification = msg.id === undefined || msg.id === null;
  if (isNotification) return null;

  switch (msg.method) {
    case "initialize":
      return result(msg.id, {
        protocolVersion: negotiateVersion(msg.params?.protocolVersion),
        capabilities: { tools: { listChanged: false } },
        serverInfo: opts.server,
        instructions: opts.instructions
      });

    case "ping":
      return result(msg.id, {});

    case "tools/list":
      return result(msg.id, { tools: describeTools(opts.tools) });

    case "tools/call": {
      const name = msg.params?.name;
      const tool = opts.tools.find((t) => t.name === name);
      if (!tool) return error(msg.id, -32602, `Unknown tool: ${String(name)}`);
      const args = msg.params?.arguments && typeof msg.params.arguments === "object" ? msg.params.arguments : {};
      const bad = checkArgs(tool.inputSchema, args);
      if (bad) return result(msg.id, toolContent({ text: bad, isError: true }));
      try {
        return result(msg.id, toolContent(await tool.run(args, opts.ctx)));
      } catch (e) {
        // A tool that fails tells the model why, in the result, so it can
        // explain or adjust -- a protocol error would only say "failed".
        return result(msg.id, toolContent({ text: `Could not complete: ${(e as Error)?.message || e}`, isError: true }));
      }
    }

    default:
      return error(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

export function toolContent(r: ToolResult) {
  const out: Record<string, unknown> = {
    content: [{ type: "text", text: r.data === undefined ? r.text : `${r.text}\n\n${JSON.stringify(r.data)}` }]
  };
  if (r.data !== undefined && r.data !== null && typeof r.data === "object" && !Array.isArray(r.data)) {
    out.structuredContent = r.data;
  }
  if (r.isError) out.isError = true;
  return out;
}

// The connector's address as Claude should know it. People paste our site's
// /mcp into Claude, and the site passes the request through, naming itself in
// X-DeltaMint-Public-Origin (landing/src/connector.js). The sign-in pointers
// must then name that same address: Claude checks that the metadata's
// `resource` is the URL it connected to (RFC 9728). The site is also named as
// the authorization server: it fronts Supabase Auth's sign-in so the person
// signing in sees only our name (landing/src/connector.js). Only origins on
// `allowed` are believed; anything else, a direct call included, gets the
// function's own address and Supabase Auth itself, which keep working.
export function connectorAddresses(origin: string | null, ownResource: string, ownAuthServer: string, allowed: readonly string[]) {
  return origin && allowed.includes(origin)
    ? { resource: `${origin}/mcp`, metadata: `${origin}/.well-known/oauth-protected-resource/mcp`, authServer: origin }
    : { resource: ownResource, metadata: `${ownResource}/.well-known/oauth-protected-resource`, authServer: ownAuthServer };
}

// THE USAGE RECORD (migration 0059, connector_calls): one row per tools/call,
// read by Admin's "AI connector" tab.
//
// A call failed if the answer is a JSON-RPC error or a tool result marked
// isError (a bad argument, a broker that refused); anything else succeeded.
export function callSucceeded(reply: any): boolean {
  return Boolean(reply) && !reply.error && !(reply.result && reply.result.isError);
}

// The arguments as stored: the filters and tickers asked for, or a note that
// they were too large to keep. Never more than `max` characters of JSON.
export function recordedArgs(args: unknown, max = 2000): unknown {
  if (args === undefined || args === null) return null;
  try {
    const text = JSON.stringify(args);
    return text.length <= max ? args : { truncated: true, chars: text.length };
  } catch {
    return { unreadable: true };
  }
}

