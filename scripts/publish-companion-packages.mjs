#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateProvenanceStatement, validateRegistryIdentity } from '../packages/mcp/scripts/github-hosted-release.mjs';

const repository = 'Dexter-DAO/opendexter-ide';
const workflowPath = '.github/workflows/publish-companion-packages.yml';
const registry = 'https://registry.npmjs.org/';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const policies = [
  { name: '@dexterai/x402-mcp-tools', path: 'packages/x402-mcp-tools', prefix: 'x402-mcp-tools-v' },
  { name: '@dexterai/x402-discovery', path: 'packages/x402-discovery', prefix: 'x402-discovery-v' },
];
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const digest = (path, algorithm = 'sha256', encoding = 'hex') => createHash(algorithm).update(readFileSync(path)).digest(encoding);
const fail = (message) => { throw new Error(message); };
const run = (command, args, cwd = root, env = process.env) => execFileSync(command, args, {
  cwd, env, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
}).trim();
const npmEnv = () => ({
  PATH: process.env.PATH, HOME: process.env.HOME,
  npm_config_userconfig: '/dev/null', npm_config_globalconfig: '/dev/null.opendexter-companion-release',
  npm_config_registry: registry, npm_config_ignore_scripts: 'true',
  npm_config_audit: 'false', npm_config_fund: 'false',
});
const output = (values) => {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT,
    Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join(''));
};

export function selectPackage(ref, manifest) {
  const policy = policies.find((item) => ref === `refs/tags/${item.prefix}${manifest.version}`);
  if (!policy || manifest.name !== policy.name || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    fail('release tag must identify the exact supported stable package version');
  }
  if (manifest.publishConfig?.access !== 'public' || (manifest.publishConfig.tag ?? 'latest') !== 'latest') {
    fail('companion release must publish publicly to latest');
  }
  return { ...policy, version: manifest.version, distTag: 'latest' };
}

function sourceContext() {
  if (process.env.GITHUB_REPOSITORY !== repository || process.env.GITHUB_REF_TYPE !== 'tag'
    || !['push', 'workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME)) fail('release requires a canonical repository tag');
  const ref = process.env.GITHUB_REF;
  const policy = policies.find((item) => ref?.startsWith(`refs/tags/${item.prefix}`));
  if (!policy) fail('unsupported companion package tag');
  const selected = selectPackage(ref, readJson(resolve(root, policy.path, 'package.json')));
  const commit = run('git', ['rev-parse', 'HEAD']);
  const tagCommit = run('git', ['rev-parse', `${ref}^{commit}`]);
  const tagObject = run('git', ['rev-parse', ref]);
  if (commit !== tagCommit || ![tagCommit, tagObject].includes(process.env.GITHUB_SHA)) fail('tag and checkout differ');
  run('git', ['merge-base', '--is-ancestor', commit, 'origin/main']);
  if (run('git', ['status', '--porcelain', '--untracked-files=normal'])) fail('release source must be clean');
  if (process.version !== 'v22.19.0' || run('npm', ['--version'], root, npmEnv()) !== '10.9.3') fail('release toolchain differs');
  return { package: selected, repository, ref, commit, tree: run('git', ['rev-parse', 'HEAD^{tree}']) };
}

export function verifyBundle(bundle, expectedTarballSha256, expectedReceiptSha256) {
  const receiptPath = resolve(bundle, 'release.json');
  if (digest(receiptPath) !== expectedReceiptSha256) fail('release receipt digest differs');
  const receipt = readJson(receiptPath);
  const policy = selectPackage(receipt.context.ref, {
    name: receipt.context.package.name, version: receipt.context.package.version,
    publishConfig: { access: 'public', tag: receipt.context.package.distTag },
  });
  if (receipt.context.repository !== repository || receipt.context.package.path !== policy.path
    || receipt.provenance.repository !== `https://github.com/${repository}`
    || receipt.provenance.workflowPath !== workflowPath
    || receipt.provenance.ref !== receipt.context.ref) fail('release identity differs');
  if (typeof receipt.artifact.filename !== 'string' || basename(receipt.artifact.filename) !== receipt.artifact.filename
    || !receipt.artifact.filename.endsWith('.tgz')) fail('unsafe tarball filename');
  const tarball = resolve(bundle, receipt.artifact.filename);
  if (digest(tarball) !== expectedTarballSha256 || digest(tarball) !== receipt.artifact.sha256
    || `sha512-${digest(tarball, 'sha512', 'base64')}` !== receipt.artifact.integrity
    || digest(tarball, 'sha1') !== receipt.artifact.shasum) fail('packed bytes differ');
  const manifest = JSON.parse(run('tar', ['-xOf', tarball, 'package/package.json']));
  selectPackage(receipt.context.ref, manifest);
  return { receipt, tarball };
}

async function build(bundle) {
  const context = sourceContext();
  mkdirSync(bundle, { recursive: true });
  run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], root, npmEnv());
  if (context.package.name === '@dexterai/x402-mcp-tools') {
    run('npm', ['run', 'release:prepare', '--workspace=@dexterai/x402-mcp-tools'], root, npmEnv());
  }
  const [packed] = JSON.parse(run('npm', ['pack', '--json', '--ignore-scripts', `--pack-destination=${bundle}`],
    resolve(root, context.package.path), npmEnv()));
  const tarball = resolve(bundle, packed.filename);
  const receipt = {
    schemaVersion: 1, context,
    artifact: { filename: packed.filename, sha256: digest(tarball),
      integrity: `sha512-${digest(tarball, 'sha512', 'base64')}`, shasum: digest(tarball, 'sha1') },
    provenance: { repository: `https://github.com/${repository}`, workflowPath,
      ref: context.ref, predicateType: 'https://slsa.dev/provenance/v1' },
  };
  const fresh = mkdtempSync(resolve(tmpdir(), 'opendexter-companion-install-'));
  try {
    writeFileSync(resolve(fresh, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
    run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], fresh, npmEnv());
    if (context.package.name === '@dexterai/x402-mcp-tools') {
      run('node', ['--input-type=module', '-e', "const esm=await import('@dexterai/x402-mcp-tools'); const {createRequire}=await import('node:module'); const cjs=createRequire(import.meta.url)('@dexterai/x402-mcp-tools'); for (const key of ['registerFetchTool','registerCheckTool']) if(typeof esm[key]!=='function'||typeof cjs[key]!=='function') throw new Error('missing export '+key)"], fresh, npmEnv());
    } else {
      run('node', ['node_modules/@dexterai/x402-discovery/bin/index.js', '--help'], fresh, npmEnv());
    }
  } finally { rmSync(fresh, { recursive: true, force: true }); }
  writeFileSync(resolve(bundle, 'release.json'), `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  if (run('git', ['status', '--porcelain', '--untracked-files=normal'])) fail('release build changed tracked source');
  output({ artifact_name: `companion-${context.package.version}-${context.commit}-${context.package.prefix}`,
    tarball_sha256: receipt.artifact.sha256, receipt_sha256: digest(resolve(bundle, 'release.json')),
    package_name: context.package.name, package_version: context.package.version });
  return receipt;
}

async function registryState(receipt, requireDistTag) {
  const [version, packument] = await Promise.all([
    fetch(`${registry}${encodeURIComponent(receipt.context.package.name)}/${receipt.context.package.version}`),
    fetch(`${registry}${encodeURIComponent(receipt.context.package.name)}`, { headers: { accept: 'application/vnd.npm.install-v1+json' } }),
  ]);
  if (version.status === 404) return 'absent';
  if (!version.ok || !packument.ok) fail(`registry returned HTTP ${version.status}/${packument.status}`);
  const metadata = await version.json();
  validateRegistryIdentity({ receipt, metadata, packument: await packument.json(), requireDistTag });
  const url = new URL(metadata.dist?.attestations?.url ?? '');
  if (url.origin !== registry.slice(0, -1) || !url.pathname.startsWith('/-/npm/v1/attestations/')) fail('registry provenance URL differs');
  const response = await fetch(url);
  if (!response.ok) fail(`provenance returned HTTP ${response.status}`);
  const attestation = (await response.json()).attestations?.find((item) => item.predicateType === receipt.provenance.predicateType);
  const payload = attestation?.bundle?.dsseEnvelope?.payload;
  if (typeof payload !== 'string') fail('registry provenance is missing');
  validateProvenanceStatement({ statement: JSON.parse(Buffer.from(payload, 'base64').toString()), receipt });
  return 'same';
}

export async function main([command, directory, tarballSha, receiptSha]) {
  if (!directory) fail('bundle directory is required');
  const bundle = resolve(directory);
  if (command === 'build') return build(bundle);
  const { receipt, tarball } = verifyBundle(bundle, tarballSha, receiptSha);
  if (command === 'verify') { output({ tarball, dist_tag: receipt.context.package.distTag }); return; }
  if (!['preflight', 'reconcile'].includes(command)) fail('unsupported command');
  const attempts = command === 'reconcile' ? 12 : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const state = await registryState(receipt, command === 'reconcile');
      if (state === 'same' || command === 'preflight') {
        output({ should_publish: state === 'absent' ? 'true' : 'false' });
        return { state };
      }
      fail('published version is not visible yet');
    } catch (error) {
      if (attempt === attempts - 1) throw error;
      await new Promise((done) => setTimeout(done, 3000));
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then((result) => { if (result) process.stdout.write(`${JSON.stringify(result)}\n`); })
    .catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
