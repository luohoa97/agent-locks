#!/usr/bin/env node
/**
 * Module: agent-locks stdio MCP server entrypoint.
 *
 * Launched by an MCP client (e.g. Claude Code) as a local subprocess
 * communicating over stdin/stdout. See README for how to configure this in
 * Claude Code (`claude mcp add` / `.mcp.json`).
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  // stdout is reserved for the MCP JSON-RPC channel; stderr is safe and is
  // exactly what Claude Code surfaces for a stdio server's diagnostic output.
  process.stderr.write(`agent-locks: fatal error during startup: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
