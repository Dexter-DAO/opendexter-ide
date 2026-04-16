# OpenDexter Distribution Audit

**Date:** 2026-04-02
**Scope:** `@dexterai/opendexter` npm package, Claude Code plugin, Cursor plugin
**Author:** Branch + Claude Code

---

## Architecture Map

```
                        DISTRIBUTION CHANNELS
                        =====================

    npm registry                Cursor Marketplace           Claude Code
    (@dexterai/opendexter)      (dexter-cursor repo)         (via npm installer)
    ========================    ========================     ========================
    |                      |    |                      |     |                      |
    |  MCP Server          |    |  MCP Server          |     |  MCP Server          |
    |  (5 live tools)      |    |  (via mcp.json ref)  |     |  (via ~/.claude.json)|
    |                      |    |                      |     |                      |
    |  CLI Installer       |    |  7 Skills      [S]   |     |  7 Skills      [S]   |
    |  (6 client targets)  |    |  2 Rules       [U]   |     |  (from npm package)  |
    |                      |    |  1 Agent       [U]   |     |                      |
    |  7 Skills      [S]   |    |  3 Commands    [U]   |     |  Marketplace         |
    |  (bundled in pkg)    |    |                      |     |  (auto-registered)   |
    |                      |    |                      |     |                      |
    ========================    ========================     ========================
            |                          |                            |
            |        SHARED CONTENT    |                            |
            |        ==============    |                            |
            |                          |                            |
            +--- 7 SKILL.md files -----+----------------------------+
            |    (DUPLICATED across    |
            |     both repos)          |
            |                          |
            +--- MCP server binary ----+  (cursor refs npm via npx)
                 (single source:
                  dexter-mcp repo)


                        UNIQUE TO EACH CHANNEL
                        ======================

    npm package ONLY            Cursor plugin ONLY           Claude Code ONLY
    ----------------            ------------------           ----------------
    - CLI commands              - 2 always-on rules          - Marketplace
      (search, check,            (x402-protocol.mdc,          registration
       fetch, wallet,             x402-coding.mdc)            (known_marketplaces,
       settings, access,        - 1 agent persona              installed_plugins,
       install, setup)            (x402-engineer.md)           settings.json)
    - Wallet management         - 3 setup commands
      (create, vanity,            (setup-opendexter,
       migrate)                   setup-x402-client,
    - Widget HTML files           setup-x402-server)
    - Spend controls            - .cursor-plugin manifest


                        DATA FLOW
                        =========

    User runs: npx @dexterai/opendexter install --client claude-code
                                |
                                v
                    +------------------------+
                    |  1. Create/load wallet |
                    |     ~/.dexterai-mcp/   |
                    +------------------------+
                                |
                                v
                    +------------------------+
                    |  2. Write MCP config   |
                    |     ~/.claude.json     |
                    +------------------------+
                                |
                                v
                    +------------------------+
                    |  3. Create marketplace |
                    |     dir + manifest     |
                    +------------------------+
                                |
                                v
                    +------------------------+
                    |  4. Copy 7 skills to   |
                    |     cache + marketplace|
                    +------------------------+
                                |
                                v
                    +------------------------+
                    |  5. Register plugin    |
                    |     + enable in        |
                    |     settings.json      |
                    +------------------------+
                                |
                                v
                    +------------------------+
                    |  6. Clean up legacy    |
                    |     x402@local entries |
                    +------------------------+
```

---

## Rating

### npm package (`@dexterai/opendexter`) — 9/10

| Aspect | Rating | Notes |
|--------|--------|-------|
| Install experience | Excellent | One command, auto-detect, 6 clients |
| Package size | Excellent | 46kB packed, 16 files, no bloat |
| CLI completeness | Excellent | Every MCP tool also works standalone |
| Wallet UX | Strong | Auto-create, vanity option, env var override, dual-chain |
| Spend controls | Strong | Persistent defaults, per-call override, pre-flight balance check |
| Documentation | Strong | Clear README, tool examples, chain table |
| Skill bundling | New (v1.2.1) | 7 skills now ship in package, installed for Claude Code |

**Gap:** `setup` command should be verified to trigger Claude Code skill installation too, not just MCP config.

### Claude Code plugin — 8/10

| Aspect | Rating | Notes |
|--------|--------|-------|
| Install experience | Excellent (now) | Single command, full plugin + MCP |
| Plugin loading | Working | `claude plugin list` shows enabled |
| Skill coverage | Full | All 7 SDK/protocol skills load |
| Legacy cleanup | Handled | Installer removes broken x402@local entries |
| Fresh install | Verified | Tested with temp HOME, clean from zero |

**Gaps:**
- No rules or agent persona (Cursor gets both, Claude Code doesn't)
- No update notification mechanism
- No setup commands (Cursor gets 3 guided workflows)

### Cursor plugin (`dexter-cursor`) — 9.5/10

| Aspect | Rating | Notes |
|--------|--------|-------|
| Content depth | Excellent | 7 skills, 2 rules, 1 agent, 3 commands |
| Layered activation | Excellent | Rules always-on, skills contextual, commands explicit |
| Architecture | Excellent | MCP + knowledge + scaffolding in one plugin |
| Documentation | Excellent | Full README with architecture diagram, chain table |
| Marketplace presence | Strong | Published on Cursor Marketplace |

**Gap:** README still leads with "Cursor Marketplace" framing despite now supporting Claude Code.

---

## Issues

### 1. Skill duplication across repos (Medium)

The 7 SKILL.md files now exist in two places:

| Location | Repo |
|----------|------|
| `dexter-mcp/packages/mcp/skills/` | Source for npm package + Claude Code |
| `dexter-cursor/skills/` | Source for Cursor plugin |

These will drift. When you update a skill in one repo, the other becomes stale. Already observed: `x402-protocol/SKILL.md` differs between the two.

**Recommended fix:** Make `dexter-mcp` the single source of truth for skills. At build time in `dexter-cursor`, pull skills from the npm package or a shared directory. Alternatively, move skills into their own repo/package and have both consume from it.

### 2. Claude Code missing rules + agent (Medium)

Cursor users get 2 always-on rules and an agent persona. Claude Code users get neither. The rules inject foundational x402 knowledge (CAIP-2 networks, import patterns, atomic units) into every conversation. Without them, the Claude Code agent has to rely on skills triggering correctly.

**Recommended fix:** Convert rules to a skill with a very broad trigger description, or find the Claude Code equivalent of always-on rules.

### 3. No update path (Low)

Re-running the installer works but there's no version check, no "you're on 1.2.0, 1.2.1 is available" message. Users won't know updates exist.

### 4. `setup` command skill installation (Medium — unverified)

The `setup` command calls `install --all` under the hood. Need to verify it triggers `installClaudeCodePlugin()` and not just MCP config.

---

## Files changed in this session

| Repo | File | Change |
|------|------|--------|
| `dexter-mcp` | `packages/mcp/skills/` | Restructured: flat SKILL.md to 7 subdirectories |
| `dexter-mcp` | `packages/mcp/src/cli/install/index.ts` | Added `installClaudeCodePlugin()` — full marketplace + skills installation |
| `dexter-mcp` | `packages/mcp/README.md` | Added Claude Code plugin docs, fixed manual config section |
| `dexter-mcp` | `packages/mcp/scripts/test-fresh-install.sh` | New: fresh install test script |
| `dexter-mcp` | `packages/mcp/package.json` | Added `test:fresh-install` script, bumped to 1.2.1 |
| `dexter-cursor` | `README.md` | Added Claude Code install callout |
| `dexter-cursor` | `commands/setup-opendexter.md` | Updated to note Claude Code full support |

## Published

- `@dexterai/opendexter@1.2.1` on npm — includes 7 skills + Claude Code plugin installer
