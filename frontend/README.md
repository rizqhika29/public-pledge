# Public Pledge — frontend

Next.js 16 (App Router) + Tailwind 4 + `genlayer-js` 1.1.8, talking to the `PublicPledge` intelligent contract in `../contracts/public_pledge.py`.

```bash
npm install
cp .env.example .env.local     # then set NEXT_PUBLIC_CONTRACT_ADDRESS
npm run dev                    # http://localhost:3000
npm run build && npm run typecheck
```

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `NEXT_PUBLIC_GENLAYER_NETWORK` | `studionet` | `studionet` or `localnet`. Bradbury needs SDK v2 and is not offered. |
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | empty | Address of the deployed contract. Without it the app renders, shows a setup notice, and disables writes. |

Both are read at build time, so a change needs a restart.

## Pages

| Route | Purpose |
|---|---|
| `/` | Landing page: what a pledge is, how judgement works, live on-chain stats, FAQ. |
| `/how-it-works` | Lifecycle, how validators decide, the three verdicts, limits. |
| `/pledges` | Every pledge, filterable by open / ready for judgement / settled / mine. |
| `/pledges/[id]` | One pledge: criteria, evidence link, the validators' verdict and reasoning, actions. |
| `/create` | The pledge form: validation mirrors the contract's own rules. |
| `/account` | Your record (kept / broken), your pledges, pledges naming you as beneficiary, and withdrawal. |

## Wallet connection: one wallet, one prompt

Several extensions inject `window.ethereum` and overwrite each other. That is what makes them fight over pop-ups, and it is the specific problem this code avoids:

1. **Discovery uses EIP-6963.** Every wallet announces itself with its own provider (`lib/genlayer/wallets.ts`). The user picks one in `ConnectModal`. We never read `window.ethereum` unless no wallet announced itself at all (a legacy fallback).
2. **Every request goes to the chosen provider.** `getWriteClient(signer)` hands `genlayer-js` that exact provider, so the SDK never falls back to `window.ethereum` and never reaches a different wallet.
3. **Single flight.** `WalletProvider.exclusive` allows one wallet prompt at a time; a second attempt throws `WalletBusyError` instead of stacking a pop-up. `TxProvider` adds the same guard across whole transactions, so a double click cannot send twice.
4. **Reads never prompt.** All view methods go through an account-free client (`getReadClient`). Restoring a session uses `eth_accounts`, which also never prompts.
5. **No surprise prompts.** Nothing opens a wallet on page load. The network banner and the "switch network" button only appear when the user acts.

## Transaction flow and feedback

`TxProvider.run()` drives one transaction end to end:

1. `getSigner()` re-reads `eth_chainId` (does not prompt) and refuses to continue on the wrong network.
2. `submitWrite()` signs and sends once. From the moment a transaction hash exists, it is never re-sent.
3. The dialog shows two steps: *confirm in your wallet*, then *validators reach consensus*, with the hash visible and the ability to close the dialog while polling continues.
4. On success the queries are invalidated and the caller may attach extra detail (`afterSuccess`), such as the verdict just produced.
5. On failure the error is classified and shown with an actionable message.

`ACCEPTED` is **not** treated as success on its own: `verifyReceipt` also inspects the leader receipt, so a transaction the validators accepted but whose execution errored is reported as a contract error, and an `UNDETERMINED` / timeout status is reported as "consensus did not complete".

## Error handling

`lib/errors.ts` is the single place that turns anything thrown into a title and a message.

- Typed errors first: `WalletBusyError`, `NotConnectedError`, `WrongNetworkError`, `NoContractError`, `TxFailedError`.
- Then wallet codes, read from **every** nested `code` the wallet wrapped (`data.originalError.code` and friends), because wallets do not agree where to put them: `4001`/`5000` user rejected, `-32002` request already pending, `4900`/`4901` disconnected, `4200`/`-32601` unsupported method.
- Then message matching: insufficient funds, network unreachable.
- Contract errors carry a tag (`[EXPECTED]`, `[EXTERNAL]`), which becomes a specific sentence rather than a raw trace. Model-quality problems are not errors: the contract records them as an `inconclusive` verdict, so they arrive as a result and not as a failed transaction.

## Files worth knowing

```
lib/genlayer/WalletProvider.tsx   discovery, session restore, single-flight, network switching
lib/genlayer/wallets.ts           EIP-6963 types and the legacy fallback
lib/genlayer/client.ts            read client (no account) and write client (user's provider)
lib/tx.ts                         send once, poll, and verify the consensus receipt
lib/errors.ts                     error classification and user-facing wording
lib/contract.ts                   typed wrappers over the contract's view methods
lib/pledge.ts                     pledge model, phases, and parsing of RPC responses
components/TxProvider.tsx         the transaction dialog and its two-step feedback
components/CreatePledgeForm.tsx   form + validation mirroring the contract
```

## Known limits

- `genlayer-js` 1.1.8 has no fee estimation (that is a v2 API), so no `fees` are sent. Fine on Studionet and Localnet; Bradbury will need the v2 migration.
- The frontend has not been exercised in a browser with a real wallet. Its API usage was checked against the SDK source, and CI typechecks and builds it, but that is not the same as clicking through it.
- Pledges are read by paging `get_pledges`, capped at 1000 items in the browser. A much larger set would need an indexer.
