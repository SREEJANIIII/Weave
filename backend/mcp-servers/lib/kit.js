// Tiny helpers shared by Weave's demo MCP servers.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

export function createServer(name) {
  return new McpServer({ name, version: '0.1.0' });
}

/** Successful result: structured data plus the same data as text for clients that only read text. */
export function ok(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data };
}

/** Tool-level error the model (and the user) can read. */
export function fail(message) {
  return { content: [{ type: 'text', text: message }], isError: true };
}

export async function serve(server) {
  await server.connect(new StdioServerTransport());
}

// MCP tool annotations. Weave treats anything not marked read-only as a change that needs approval.
export const READ = { readOnlyHint: true, openWorldHint: false };
export const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
