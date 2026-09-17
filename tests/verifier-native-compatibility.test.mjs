import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  validateHostedDescriptor,
  verifyMaterializedHostedDescriptor,
} from "../packages/mcp/scripts/verify-hosted-source.mjs";

const checkpoint = {
  commit: "33ffd350e3ceb6ac6cd36ec48ebcf1552a4872dd",
  tree: "557ff0e749ab41157b01cb18fd6f6593fb8689a1",
};
const historical = {
  commit: "fa0701b67625911b8ec97a5399f62ec97a69f976",
  tree: "dcee95df1d92018b8fcd8b43645fe63211383274",
};
const currentBindingPath =
  "tests/fixtures/governed-agent-trade-api-facilitator-binding-vault-0434.json";
const historicalBindingPath =
  "tests/fixtures/governed-agent-trade-api-facilitator-binding-v1.json";

function fixture() {
  const pinned = JSON.parse(readFileSync(new URL(
    "../plugins/opendexter/skills/opendexter/references/hosted-contract.json",
    import.meta.url,
  ), "utf8"));
  const descriptor = Object.fromEntries([
    "schemaVersion", "kind", "sourceContracts", "oauth", "anonymousToolNames",
    "oauthPromotedToolNames", "connectedToolNames", "optionalOAuthToolNames", "tools",
  ].map((key) => [key, pinned[key]]));
  descriptor.kind = "opendexter-hosted-tool-descriptors/v2";
  Object.assign(descriptor.sourceContracts.api, historical);
  Object.assign(descriptor.sourceContracts.integratedApiRelease, checkpoint, {
    governedContractCommit: checkpoint.commit,
    governedContractTree: checkpoint.tree,
  });
  Object.assign(descriptor.sourceContracts.portfolioProjection, checkpoint);
  descriptor.sourceContracts.facilitator.bindingFixture.consumerPath = currentBindingPath;
  return descriptor;
}

test("accepts the native MCP roster with an independent reviewed API checkpoint and Vault 0.43.4 fixture", () => {
  const descriptor = fixture();
  assert.equal(descriptor.connectedToolNames.length, 14);
  assert.notEqual(descriptor.sourceContracts.api.commit, checkpoint.commit);
  assert.deepEqual(validateHostedDescriptor(descriptor), descriptor);
  assert.deepEqual(verifyMaterializedHostedDescriptor(descriptor, structuredClone(descriptor)), descriptor);
});

test("retains compatibility with the historical source checkpoint and FAC fixture", () => {
  const descriptor = fixture();
  Object.assign(descriptor.sourceContracts.integratedApiRelease, {
    governedContractCommit: historical.commit,
    governedContractTree: historical.tree,
  });
  descriptor.sourceContracts.facilitator.bindingFixture.consumerPath = historicalBindingPath;
  assert.deepEqual(validateHostedDescriptor(descriptor), descriptor);
});

test("requires complete checkpoint identities and consistent trees for the same commit", () => {
  for (const [key, value] of [
    ["governedContractCommit", "short"],
    ["governedContractTree", "short"],
    ["governedContractCommit", null],
    ["governedContractTree", "F".repeat(40)],
    ["governedContractTree", "f".repeat(40)],
  ]) {
    const descriptor = fixture();
    descriptor.sourceContracts.integratedApiRelease[key] = value;
    assert.throws(() => validateHostedDescriptor(descriptor));
  }
  const descriptor = fixture();
  descriptor.sourceContracts.integratedApiRelease.governedContractCommit = historical.commit;
  assert.throws(() => validateHostedDescriptor(descriptor), /commit\/tree identity is inconsistent/);
});

test("rejects arbitrary fixture paths and foreign source repositories", () => {
  for (const mutate of [
    (source) => { source.facilitator.bindingFixture.consumerPath = "tests/fixtures/invented.json"; },
    (source) => { source.facilitator.bindingFixture.apiPath = currentBindingPath; },
    (source) => { source.facilitator.bindingFixture.facilitatorPath = currentBindingPath; },
    (source) => { source.api.consumerFixture.path = "tests/fixtures/invented.json"; },
    (source) => { source.mcp.toolContractPath = "lib/invented.mjs"; },
    (source) => { source.api.repository = "https://github.com/example/dexter-api"; },
    (source) => { source.mcp.repository = "https://github.com/example/dexter-mcp"; },
    (source) => { source.facilitator.repository = "https://github.com/example/dexter-facilitator"; },
    (source) => { source.portfolioProjection.tree = "f".repeat(40); },
  ]) {
    const descriptor = fixture();
    mutate(descriptor.sourceContracts);
    assert.throws(() => validateHostedDescriptor(descriptor));
  }
});

test("continues binding the exact native schema, auth, roster and checkpoint to source materialization", () => {
  const committed = fixture();
  for (const mutate of [
    (descriptor) => { descriptor.tools.find((tool) => tool.name === "x402_mcp_tools").inputSchema.properties = { invented: { type: "string" } }; },
    (descriptor) => { descriptor.oauth.scopesSupported.push("invented"); },
    (descriptor) => { descriptor.tools.find((tool) => tool.name === "x402_mcp_tools")._meta.securitySchemes = [{ type: "noauth" }]; },
    (descriptor) => { descriptor.connectedToolNames.pop(); },
    (descriptor) => { descriptor.sourceContracts.integratedApiRelease.governedContractCommit = "a".repeat(40); },
    (descriptor) => { descriptor.sourceContracts.facilitator.bindingFixture.consumerPath = historicalBindingPath; },
  ]) {
    const changed = structuredClone(committed);
    mutate(changed);
    assert.throws(() => verifyMaterializedHostedDescriptor(committed, changed));
  }
});
