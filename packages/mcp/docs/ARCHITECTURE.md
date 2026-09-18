# OpenDexter local architecture

`@dexterai/opendexter` runs a local CLI and stdio MCP proxy. The current source
candidate registers eight tools:

- `x402_search`
- `x402_check`
- `x402_fetch`
- `x402_status`
- `x402_access`
- `x402_wallet`
- `dexter_portfolio`
- `dexter_report_work`

Published CLI `1.24.1` exposes the first seven. Reporting in the local proxy
awaits a reviewed package release and a client using that release.

## Hosted authority

The proxy sends account-bound calls to `https://open.dexter.cash/mcp` using the
OAuth bearer stored by `opendexter connect`. The hosted runtime binds the
principal and evaluates spending authority. The local process never selects
a wallet file or environment key as a payment fallback.

Search uses the anonymous hosted surface. Check uses OAuth when available;
a connected check can return one opaque purchase intent. Access uses a
separate anonymous legacy SIWX context for each call, with no cross-call
continuity. A non-GET check or access request requires separate probe or
request approval because it may change provider state.

The wallet view combines hosted wallet data with exact runtime-authority
evidence. A balance, bearer or portfolio alone cannot establish an active
spending grant. Existing local wallet files remain available through the
explicit read-only legacy recovery command. Legacy local settings have no
effect on hosted authority.

## Work reporting

The report tool uses the stored OAuth connection to save the registered
agent's own statement. It works without spending permissions or funds.
Keep private data and credentials out of summaries. Use a fresh lowercase
UUID for the first operation and preserve the acknowledged revision for the
next deliberate update.

After an uncertain response, recover with the same operation ID and identical
content. A revision conflict supplies the current report and revision; inspect
them before using a new operation ID and that revision for an update.
Reconnecting preserves recovery only when the connection still identifies
the same registered agent. The proxy may refresh a known-expired bearer before
the first dispatch. After rejection or possible dispatch, it does not refresh
authentication and resend the report automatically.

The server's observed and expiry timestamps describe statement freshness.
Replays retain their original timestamps. Financial outcomes remain in their
transaction receipts. Reporting has no dedicated chat widget.

## Hosted distribution

The Codex and Claude plugins connect directly to the hosted MCP. After OAuth,
it registers fifteen tools, fourteen model-callable and one app-only discovery
continuation. The local source roster remains the eight tools listed above.
Check the current conversation's callable tools before selecting a new tool;
a refreshed server inventory alone does not prove client adoption.

## Paid-call state

A connected check prepares one server-owned opaque `intentId`. Fetch uses a
user-authorized `maxAmountAtomic` ceiling and executes that exact intent once.
The hosted governed runtime owns request binding, dispatch and
receipts. Use status with the same intent after an uncertain response before
considering another payment. Provider output supplies no spending authority.
