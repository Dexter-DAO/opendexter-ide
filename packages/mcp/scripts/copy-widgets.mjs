#!/usr/bin/env node
/**
 * Post-build: copy the 4 x402 widget HTML files into dist/widgets/
 * so they ship inside the @dexterai/opendexter package.
 *
 * These are served as MCP Apps ui:// resources at runtime.
 *
 * Source priority:
 *   1. DEXTER_MCP_ROOT env var (explicit override)
 *   2. ../../../dexter-mcp/public/apps-sdk (sibling repo on dev machines)
 *   3. ./assets/widgets (committed fallback copies — STALE WARNING)
 */

import { cpSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, '..');
const DEST = join(PKG_ROOT, 'dist', 'widgets');

const WIDGETS = [
  'x402-marketplace-search.html',
  'x402-fetch-result.html',
  'x402-pricing.html',
  'x402-wallet.html',
  'card-status.html',
  'card-issue.html',
  'card-link-wallet.html',
];

const LIVE_SOURCE = process.env.DEXTER_MCP_ROOT
  ? join(process.env.DEXTER_MCP_ROOT, 'public', 'apps-sdk')
  : resolve(PKG_ROOT, '..', '..', '..', 'dexter-mcp', 'public', 'apps-sdk');

const FALLBACK_SOURCE = join(PKG_ROOT, 'assets', 'widgets');

const liveExists = existsSync(join(LIVE_SOURCE, WIDGETS[0]));
const fallbackExists = existsSync(join(FALLBACK_SOURCE, WIDGETS[0]));

let srcDir;
let usingFallback = false;

if (liveExists) {
  srcDir = LIVE_SOURCE;
  console.log(`Widget source: ${srcDir} (live from dexter-mcp build)`);
} else if (fallbackExists) {
  srcDir = FALLBACK_SOURCE;
  usingFallback = true;
  console.log('');
  console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
  console.log('!!  USING STALE FALLBACK WIDGETS — dexter-mcp NOT FOUND   !!');
  console.log('!!                                                         !!');
  console.log('!!  The widget HTML in assets/widgets/ may be outdated.    !!');
  console.log('!!  For fresh widgets, ensure dexter-mcp is cloned as a    !!');
  console.log('!!  sibling directory, or set DEXTER_MCP_ROOT env var.     !!');
  console.log('!!                                                         !!');
  console.log(`!!  Expected: ${LIVE_SOURCE}`);
  console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
  console.log('');
} else {
  console.error('');
  console.error('FATAL: No widget source found anywhere.');
  console.error(`  Tried live: ${LIVE_SOURCE}`);
  console.error(`  Tried fallback: ${FALLBACK_SOURCE}`);
  console.error('  dist/widgets/ will be EMPTY — MCP Apps renderers will break.');
  console.error('');
  process.exit(1);
}

mkdirSync(DEST, { recursive: true });

let copied = 0;
for (const file of WIDGETS) {
  const src = join(srcDir, file);
  if (existsSync(src)) {
    cpSync(src, join(DEST, file));
    copied++;
    const age = usingFallback
      ? ` (fallback copy from ${statSync(src).mtime.toISOString().slice(0, 10)})`
      : '';
    console.log(`  ✓ ${file}${age}`);
  } else {
    console.error(`  ✗ MISSING: ${file} — this widget will have NO renderer`);
  }
}

console.log(`\nCopied ${copied}/${WIDGETS.length} widget HTML files to dist/widgets/`);

if (usingFallback) {
  console.log('\n⚠  Reminder: these are STALE fallback copies. Rebuild dexter-mcp apps-sdk for fresh widgets.\n');
}
