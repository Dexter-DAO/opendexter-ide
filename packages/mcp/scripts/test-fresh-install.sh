#!/usr/bin/env bash
#
# Simulates a first-time user installing OpenDexter into Claude Code.
# Uses a temporary HOME so nothing on your machine is touched.
#
set -euo pipefail

TEST_HOME=$(mktemp -d)
trap 'rm -rf "$TEST_HOME"' EXIT

echo "Testing fresh install with HOME=$TEST_HOME"
echo

HOME=$TEST_HOME npx @dexterai/opendexter@latest install --client claude-code --yes

echo
echo "--- Installed files ---"
find "$TEST_HOME/.claude" -type f | sort

echo
echo "--- MCP config ---"
cat "$TEST_HOME/.claude.json" | python3 -m json.tool

echo
echo "--- Plugin registry ---"
cat "$TEST_HOME/.claude/plugins/installed_plugins.json" | python3 -m json.tool

echo
echo "--- Skills installed ---"
for f in "$TEST_HOME"/.claude/plugins/cache/opendexter/opendexter/*/skills/*/SKILL.md; do
  head -3 "$f" | grep "^name:" || true
done

echo
echo "Fresh install test passed."
