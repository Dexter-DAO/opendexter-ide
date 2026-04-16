# Changelog

## 1.4.0

- Moved `@dexterai/opendexter` and `@dexterai/x402-discovery` npm package source into this repo
- Added npm workspaces monorepo structure (`packages/mcp/`, `packages/x402-discovery/`)
- Skills, rules, agents, and commands are now a single source of truth in `packages/mcp/`
- Plugin directories (`opendexter-plugin/`) symlink to `packages/mcp/` — no more manual sync
- Widget HTML files committed as static assets with sibling-repo auto-detection fallback
- Updated all docs for new repo structure

## 1.1.0

- Bumped plugin version for CC update propagation
- Skills audit: all 6 skills synced against SDK v3.0.1 source
- Merged x402-marketplace skill content into opendexter skill (6 skills total)
- Added MCP server instructions and 3 skill resources to hosted server
- Fixed CC installer to use CC CLI instead of raw JSON manipulation
- Added full Cursor plugin installer (skills + rules + agents + commands)

## 1.0.0

- Initial release
- 6 skills: opendexter, x402-client, x402-server, x402-react, x402-protocol, x402-debugging
- 2 always-on rules: x402-protocol, x402-coding
- 1 agent: x402-engineer
- 3 commands: setup-opendexter, setup-x402-client, setup-x402-server
- Ships with @dexterai/opendexter MCP server (x402_search, x402_fetch, x402_check, x402_wallet, x402_pay, x402_access, x402_settings)
