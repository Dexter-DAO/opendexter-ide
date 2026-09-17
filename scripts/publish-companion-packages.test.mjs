import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { afterEach, test } from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main, selectPackage, verifyBundle } from './publish-companion-packages.mjs';

const roots = [];
const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const hash = (path, kind = 'sha256', encoding = 'hex') => createHash(kind).update(readFileSync(path)).digest(encoding);
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

for (const [workflow, job, paths] of [
  ['publish-companion-packages.yml', 'build', ['']],
  ['publish-companion-packages.yml', 'publish', ['']],
  ['publish-opendexter.yml', 'build', ['/ide', '/mcp']],
  ['publish-opendexter.yml', 'publish', ['/ide']],
]) {
  test(`${workflow} ${job} trusts only its exact checkouts before Git consumers`, () => {
    const yaml = readFileSync(resolve(repositoryRoot, '.github/workflows', workflow), 'utf8');
    const section = yaml.split(`\n  ${job}:\n`)[1].split(/\n  [a-z]+:\n/)[0];
    const commands = [...section.matchAll(/^        run: (git config --global --add safe\.directory "([^"]+)")$/gm)];
    assert.deepEqual(commands.map((match) => match[2]), paths.map((path) => `$GITHUB_WORKSPACE${path}`));
    for (const [index, match] of commands.entries()) {
      const consumer = paths[index] === '/mcp'
        ? section.indexOf('node packages/mcp/scripts/github-hosted-release.mjs build')
        : section.search(/git -c credential\.helper= fetch|node [^\n]*\.mjs/);
      assert.ok(consumer > match.index, 'checkout trust must precede the first Git consumer');
    }

    const root = mkdtempSync(resolve(tmpdir(), 'companion-checkout-trust-'));
    roots.push(root);
    const workspace = resolve(root, 'workspace');
    const unrelated = resolve(root, 'unrelated');
    const env = { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: resolve(root, 'gitconfig'),
      GIT_CONFIG_SYSTEM: '/dev/null', GITHUB_WORKSPACE: workspace };
    for (const directory of [...paths.map((path) => workspace + path), unrelated]) {
      mkdirSync(directory, { recursive: true });
      execFileSync('git', ['init', '--quiet', directory], { env });
    }
    // Git's own ownership test hook reproduces the container failure without
    // changing file ownership or touching the operator's Git configuration.
    const foreignOwner = { ...env, GIT_TEST_ASSUME_DIFFERENT_OWNER: 'true' };
    const probe = (cwd) => spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, env: foreignOwner, encoding: 'utf8' });
    for (const path of paths) {
      const before = probe(workspace + path);
      assert.equal(before.status, 128);
      assert.match(before.stderr, /dubious ownership/);
    }
    for (const match of commands) execFileSync('sh', ['-eu', '-c', match[1]], { env });
    for (const path of paths) {
      const after = probe(workspace + path);
      assert.equal(after.status, 0, after.stderr);
      assert.equal(after.stdout.trim(), workspace + path);
    }
    assert.equal(probe(unrelated).status, 128, 'unrelated checkouts must remain untrusted');
    assert.deepEqual(execFileSync('git', ['config', '--global', '--get-all', 'safe.directory'], { env, encoding: 'utf8' })
      .trim().split('\n'), paths.map((path) => workspace + path));
  });
}

function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), 'companion-release-test-'));
  roots.push(root);
  const bundle = resolve(root, 'bundle');
  mkdirSync(bundle);
  const source = resolve(root, 'source/package');
  mkdirSync(source, { recursive: true });
  const manifest = { name: '@dexterai/x402-mcp-tools', version: '0.9.0', publishConfig: { access: 'public' } };
  writeFileSync(resolve(source, 'package.json'), JSON.stringify(manifest));
  const tarball = resolve(bundle, 'tools.tgz');
  execFileSync('tar', ['-czf', tarball, '-C', resolve(source, '..'), 'package']);
  const ref = 'refs/tags/x402-mcp-tools-v0.9.0';
  const receipt = {
    context: { package: selectPackage(ref, manifest), repository: 'Dexter-DAO/opendexter-ide', ref },
    artifact: { filename: 'tools.tgz', sha256: hash(tarball), integrity: `sha512-${hash(tarball, 'sha512', 'base64')}`, shasum: hash(tarball, 'sha1') },
    provenance: { repository: 'https://github.com/Dexter-DAO/opendexter-ide', workflowPath: '.github/workflows/publish-companion-packages.yml', ref, predicateType: 'https://slsa.dev/provenance/v1' },
  };
  const receiptPath = resolve(bundle, 'release.json');
  const save = () => writeFileSync(receiptPath, JSON.stringify(receipt));
  save();
  return { bundle, tarball, receipt, receiptPath, save };
}

test('a tag must identify exactly one stable companion package and version', () => {
  const manifest = { name: '@dexterai/x402-discovery', version: '1.1.0', publishConfig: { access: 'public', tag: 'latest' } };
  assert.equal(selectPackage('refs/tags/x402-discovery-v1.1.0', manifest).path, 'packages/x402-discovery');
  for (const ref of ['refs/heads/main', 'refs/tags/x402-mcp-tools-v1.1.0', 'refs/tags/x402-discovery-v1.0.3']) {
    assert.throws(() => selectPackage(ref, manifest));
  }
  assert.throws(() => selectPackage('refs/tags/x402-discovery-v1.1.0-rc.1', { ...manifest, version: '1.1.0-rc.1' }));
  assert.throws(() => selectPackage('refs/tags/x402-discovery-v1.1.0', { ...manifest, publishConfig: { access: 'public', tag: 'next' } }));
});

test('the publish boundary verifies the real tar contents and both independent hashes', () => {
  const f = fixture();
  assert.equal(verifyBundle(f.bundle, hash(f.tarball), hash(f.receiptPath)).receipt.context.package.name, '@dexterai/x402-mcp-tools');
  assert.throws(() => verifyBundle(f.bundle, '0'.repeat(64), hash(f.receiptPath)), /packed bytes/);
  assert.throws(() => verifyBundle(f.bundle, hash(f.tarball), '0'.repeat(64)), /receipt digest/);
  f.receipt.artifact.filename = '../tools.tgz'; f.save();
  assert.throws(() => verifyBundle(f.bundle, hash(f.tarball), hash(f.receiptPath)), /unsafe tarball/);
});

test('changing the receipt cannot relabel an existing tarball as the other package', () => {
  const f = fixture();
  f.receipt.context.ref = 'refs/tags/x402-discovery-v1.1.0';
  f.receipt.context.package = selectPackage(f.receipt.context.ref, {
    name: '@dexterai/x402-discovery', version: '1.1.0', publishConfig: { access: 'public' },
  });
  f.receipt.provenance.ref = f.receipt.context.ref; f.save();
  assert.throws(() => verifyBundle(f.bundle, hash(f.tarball), hash(f.receiptPath)), /exact supported/);
});

test('preflight distinguishes absent package, immutable collision, and identical OIDC-published retry', async () => {
  const f = fixture();
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('{}', { status: 404 });
    assert.deepEqual(await main(['preflight', f.bundle, hash(f.tarball), hash(f.receiptPath)]), { state: 'absent' });
    globalThis.fetch = async () => Response.json({ name: '@dexterai/x402-mcp-tools', version: '0.9.0', dist: { integrity: 'different' } });
    await assert.rejects(main(['preflight', f.bundle, hash(f.tarball), hash(f.receiptPath)]), /different immutable bytes/);
    const statement = {
      _type: 'https://in-toto.io/Statement/v1', predicateType: f.receipt.provenance.predicateType,
      subject: [{ name: 'pkg:npm/%40dexterai/x402-mcp-tools@0.9.0', digest: { sha512: hash(f.tarball, 'sha512') } }],
      predicate: { buildDefinition: { externalParameters: { workflow: {
        repository: f.receipt.provenance.repository, path: f.receipt.provenance.workflowPath, ref: f.receipt.provenance.ref,
      } } }, runDetails: { builder: { id: 'https://github.com/actions/runner/github-hosted' } } },
    };
    globalThis.fetch = async (url) => {
      if (String(url).includes('/attestations/')) return Response.json({ attestations: [{ predicateType: f.receipt.provenance.predicateType,
        bundle: { dsseEnvelope: { payload: Buffer.from(JSON.stringify(statement)).toString('base64') } } }] });
      if (String(url).endsWith('/0.9.0')) return Response.json({ name: '@dexterai/x402-mcp-tools', version: '0.9.0',
        dist: { integrity: f.receipt.artifact.integrity, shasum: f.receipt.artifact.shasum,
          attestations: { url: 'https://registry.npmjs.org/-/npm/v1/attestations/example' } } });
      return Response.json({ 'dist-tags': { latest: '0.9.0' } });
    };
    assert.deepEqual(await main(['preflight', f.bundle, hash(f.tarball), hash(f.receiptPath)]), { state: 'same' });
    assert.deepEqual(await main(['reconcile', f.bundle, hash(f.tarball), hash(f.receiptPath)]), { state: 'same' });
    statement.predicate.buildDefinition.externalParameters.workflow.ref = 'refs/tags/wrong';
    await assert.rejects(main(['preflight', f.bundle, hash(f.tarball), hash(f.receiptPath)]), /workflow identity/);
  } finally { globalThis.fetch = originalFetch; }
});
