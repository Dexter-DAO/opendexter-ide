# @dexterai/x402-discovery

`@dexterai/x402-discovery` is the descriptive install alias for `@dexterai/opendexter`.
The release candidate `1.2.0` requires Node.js 22 or newer and uses
`@dexterai/opendexter@1.25.0`.

Use it when you want the package name itself to tell developers exactly what it does:

- search the x402 marketplace
- inspect pricing and schemas
- pay for and call x402 APIs

## Install

```bash
npx @dexterai/x402-discovery@1.2.0 install
```

## Manual MCP config

```json
{
  "mcpServers": {
    "opendexter": {
      "command": "npx",
      "args": ["-y", "@dexterai/x402-discovery@1.2.0"]
    }
  }
}
```

## Relationship to OpenDexter

- `@dexterai/opendexter` = the brand/product name
- `@dexterai/x402-discovery` = the descriptive alias for developer discovery

Both point to the same tool behavior.
