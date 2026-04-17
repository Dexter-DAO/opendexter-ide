# @dexterai/mcp-instructions

Shared MCP server instructions for the Dexter x402 Gateway.

This package exists to eliminate drift between the two MCP server
implementations in the Dexter stack:

1. **Hosted remote server** at `open.dexter.cash/mcp`
   (source: `~/websites/dexter-mcp/open-mcp-server.mjs`)
2. **Local npm-installable server** `@dexterai/opendexter`
   (source: `~/websites/opendexter-ide/packages/mcp/src/server/index.ts`)

Both servers must send the same workflow guidance in their
`initialize` response `instructions` field. Before this package,
those two codebases drifted — the hosted server had the guidance,
the npm package did not.

## Usage

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SERVER_INSTRUCTIONS } from '@dexterai/mcp-instructions';

const server = new McpServer(
  { name: 'Dexter x402 Gateway', version: VERSION },
  { instructions: SERVER_INSTRUCTIONS },
);
```

## Updating the instructions

1. Edit `src/index.ts`.
2. Bump the version in `package.json`.
3. `npm publish --access public`.
4. In each consumer, bump the `@dexterai/mcp-instructions` dependency and
   rebuild. Hosted server redeploys; npm package republishes.

## Why a whole package instead of a constant in one of the MCPs?

The hosted server is a single `.mjs` file deployed separately from the
npm package repo. Without a published package, the constant would have
to be hand-copied between repos on every change — exactly the drift the
Apr 16 unification sprint tried to fix.

## License

MIT
