# Public Pledge

Public commitments staked on GenLayer. Someone writes a promise in plain language, locks GEN behind it, and names one public evidence source. After the deadline, GenLayer validators read that evidence and have to agree on whether the promise was kept.

- Promise kept: the stake goes back to the owner and their public record gains a kept pledge.
- Promise broken: the stake can be claimed by the beneficiary the owner named up front.
- Evidence unreadable or ambiguous: the pledge stays open, and after a grace period the owner can take the stake back.

Status: **contract + direct-mode tests + Next.js frontend + browser end-to-end tests**. CI runs contract lint, 49 direct-mode tests, the frontend build and typecheck, 5 Chromium end-to-end tests, and the on-chain suite (20 tests) against Studionet with real validators and a real LLM.

## Lifecycle

1. `create_pledge(promise, evidence_url, criteria, beneficiary, deadline)` is sent with GEN (payable). It returns the pledge id.
2. After `deadline`, anyone may call `judge(pledge_id)`.
   - `kept`: the owner's `claimable` balance grows, owner's `kept` counter goes up.
   - `broken`: the beneficiary's `claimable` balance grows, owner's `broken` counter goes up.
   - `inconclusive`: no status change, only `note` and `checks` are updated. It can be judged again.
3. `refund_expired(pledge_id)`: seven days after the deadline, if the pledge is still `active` **and at least one judgement has been recorded**, the stake goes back to the owner with no verdict and no reputation change.
4. `withdraw()`: a recipient pulls their `claimable` balance out as GEN.

Pledge status: `active` -> `kept` | `broken` | `refunded`.

Settlement uses a pull pattern (`claimable` + `withdraw`). A verdict can never get stuck on a failed transfer, and settlement logic is testable without a network.

## How validators reach consensus

`judge` uses `gl.vm.run_nondet_unsafe` with a custom leader/validator pair (see `_judge_with_validators` in `contracts/public_pledge.py`):

- The leader fetches `evidence_url`, truncates it (12,000 characters), and asks an LLM for `{"verdict", "reason", "quote"}`.
- Validators fetch the same page **themselves** and re-run the same question. They compare the `verdict`, and they require the leader's `quote` to appear in the page they fetched themselves. The free-text `reason` may differ.
- A conclusive verdict (`kept` / `broken`) is only stored with a verbatim quote of at least 24 characters that really occurs in the page the node fetched itself. A paraphrased or invented passage can never produce a payout.
- An unreadable evidence source is **recorded as `inconclusive`** rather than reverted, so a dead link leaves an auditable record and can never lock the stake forever. The leader proposes `inconclusive` without asking the model, and a validator agrees with that only when its own fetch fails the same way. If the validator can read the page, the proposal has to survive a real re-judgement.
- An unusable model reply (no JSON, an unknown verdict, no findable quote, or an unreachable model) becomes `inconclusive` with a note saying why, instead of reverting. `judge` never reverts because of model quality: a revert writes nothing, and a pledge with no recorded judgement could never be refunded, which is how a stake gets locked forever. A payout still requires a grounded verdict that every validator can reproduce.
- All storage writes happen after consensus, outside the non-deterministic block.

## Trust model and its limits

These are deliberate and should be understood before using this with meaningful value:

- **The owner controls the promise text, the criteria, and the evidence URL.** A determined cheater can point at a page they control or hide instructions in the criteria. Validators run the same prompt, so they are influenced by it too. The prompt is hardened (evidence is marked untrusted, the answer is limited to three values, and doubt means `inconclusive`), but that is not a guarantee. The real product is the public record and the auditable commitment. Prefer third-party evidence sources (GitHub, Strava, official release pages).
- **The beneficiary never agrees to anything.** Treat them as a recipient the owner picked (a charity, an anti-charity, a friend), not as a wronged counterparty.
- **Anyone can call `judge` right after the deadline.** If the proof only appears later, the pledge may be judged `broken` first. Write criteria that depend on facts already final at the deadline.
- **A refund requires a recorded judgement.** An owner cannot skip judgement and take the stake back: `refund_expired` needs at least one recorded verdict, so a live evidence page is always judged properly. The counterparty with a stake in the outcome (the beneficiary) is the party motivated to trigger that judgement.
- **The evidence page must be stable.** Leader and validators fetch it separately. Evidence that changes every second (star counts, online status) makes validators disagree. Pick sources with facts that do not move.
- **This is not a legal decision.** It is an evidence-based commitment mechanism, not a court.

## Security notes

This contract was written against the recurring themes in GenLayer code review. Each point names what the review asks for and what this contract does instead:

- **"Validators do not verify the reasoning that is stored and reused."** The stored `note` is free text, so a `quote` field is now mandatory for conclusive verdicts and every validator checks that quote against the page it fetched itself. The stored reasoning is displayed next to that passage, not instead of it. `note` itself never feeds a payment, so it cannot steer settlement.
- **"The verdict must not depend on ungrounded evidence."** Evidence is fetched contract-side inside the non-deterministic block; a claimant-supplied snapshot or hash is never trusted.
- **"Add a timeout or escape path."** `refund_expired` is that path, and it is now gated so it cannot be used to dodge a verdict.
- **"A failing model must not lock funds."** No non-deterministic step raises on model quality: an unreachable page, an unusable reply and an ungrounded quote all degrade to `inconclusive`, so `judge` always writes a record. That record is exactly what `refund_expired` later requires. Nothing on that path can pay anyone without a verdict every validator can reproduce.
- **"A field that later drives payouts must be bound by validators."** The only fields that move money are `status` and `stake`, and `status` follows from the `verdict`, which validators bind. `reason` and `quote` are display-only.
- **"Float division crashes the VM."** There is no `/` on floats anywhere; all arithmetic is on integers (`u256`, `u32`, `u64`).
- **"Correlate each result to the transaction just submitted."** Settlement reads only the pledge row named by the transaction's own `pledge_id`, and a settled row rejects further settlement.
- **External caller manipulation.** `create_pledge` takes the owner from `gl.message.sender_address`, never from an argument. `judge` and `refund_expired` are permissionless by design, but neither pays the caller: the payout always goes to the stored owner or beneficiary. `withdraw` zeroes the balance before emitting the transfer, so a second call cannot pay twice.
- **Double submission.** A second `judge` on a settled pledge reverts; a second `refund_expired` reverts; a second `withdraw` reverts once the balance is zero. Every settlement path is idempotent per pledge.

## Setup and commands

Requires Python 3.12+.

```bash
pip install -r requirements.txt

genvm-lint check contracts/public_pledge.py   # contract lint
pytest tests/direct/ -v                       # fast in-memory tests, no network
```

Note: `genlayer-test` loads `gltest.config.yaml` as soon as it is installed, and that file reads `ACCOUNT_PRIVATE_KEY` for the on-chain network. For direct-mode work, export a throwaway value (`export ACCOUNT_PRIVATE_KEY=0x1111...`) or put one in `.env`; nothing is signed in direct mode.

Trying it in Studio: open studio.genlayer.com, load `contracts/public_pledge.py`, deploy with no constructor arguments, and fund the account from the built-in faucet.

## Frontend

Next.js 16 + Tailwind 4 + `genlayer-js` 1.1.8 (pinned), in `frontend/`.

```bash
cd frontend
npm install
npm run dev                    # http://localhost:3000
npx playwright install chromium   # once, for the browser tests
npm run test:e2e               # 5 Chromium tests, closed wallet, no network
```

One deployment, one contract, nothing to configure. `frontend/lib/config.ts` pins the network (`studionet`, chain id 61999) and the contract address (`0xfF8764165DC3D35AFe8faF7f5B1bC57bc155c798`) as constants compiled into the build, so every visitor reads and writes the same contract. There is no environment variable, no runtime switch and no fallback chain, and every number the UI shows comes from the chain. Moving to a new deployment means editing that constant and rebuilding.

Keep that address in the EIP-55 checksummed form the deploy printed. Studionet resolves a contract by the address *string*: written in all lowercase, the same live contract answers `Contract 0x… not found` to every read. CI enforces the casing with `npm run check:contract`, which reads `get_pledge_count` through the app's own SDK before a build ships.

Pages: landing (`/`), how it works (`/how-it-works`), pledge list (`/pledges`), pledge detail and consensus result (`/pledges/[id]`), create (`/create`), account and withdrawal (`/account`).

Design notes:

- **No wallet pop-up fights.** Wallets are discovered over EIP-6963 and the user picks one. Every request goes only to that wallet's provider, never to `window.ethereum`. Only one wallet request may be open at a time. Reads never open a wallet.
- **AI consensus data.** Verdict, reason, and check count are read from the `get_pledge` / `get_pledges` views and shown on the detail page and right after `judge`.
- **Transaction status.** A two-step flow, "confirm in your wallet" then "validators reach consensus", with success and error notifications. `ACCEPTED` is not treated as success when the contract execution ended in an error.
- **Networks.** Studionet and Localnet. Bradbury needs SDK v2 and is intentionally not offered.
- **Fees.** SDK 1.1.8 has no fee estimation (that is a v2 API), so the frontend does not send `fees`. That is part of the v2 migration for networks that charge fees.
- **Rate limits.** Studionet allows 60 `gen_call` per minute per IP, while one page load asks several questions and the pledge list pages through `get_pledges`. Every read goes through `lib/genlayer/rpc.ts`: a queue that spaces calls ~1.05 s apart, a 5 s cache with in-flight de-duplication (a StrictMode double mount or two components asking the same question cost one call), and backoff only on throttling-shaped errors. The cache is cleared after a write, so the UI never shows pre-transaction state.

## Deploy the frontend to Vercel

The app has no server of its own: every read and write goes from the visitor's browser straight to the GenLayer RPC, so a static host is enough. The only thing to get right is that the app is not at the repository root.

1. Import the repository at [vercel.com/new](https://vercel.com/new).
2. Set **Root Directory** to `frontend`. Vercel then detects Next.js and runs `next build`; `frontend/vercel.json` only pins the framework explicitly.
3. Keep Node 22 (pinned in `frontend/package.json` under `engines`). CI already builds this app on Node 22.
4. Deploy. There is nothing to configure: the network and the contract address are compiled into the build.

Do not add `NEXT_PUBLIC_*` variables in the Vercel project. This app reads none, so a value set there changes nothing and only looks like working configuration.

`frontend/package-lock.json` is committed, so CI and Vercel install exactly the same versions. [`.github/workflows/lockfile.yml`](.github/workflows/lockfile.yml) produces it on Node 22 — on demand, and automatically when `frontend/package.json` changes — and only commits a lockfile that built successfully. CI installs with `npm ci`, so a manifest that has drifted from the lockfile fails the build instead of quietly resolving newer versions.

What a hosted deployment means in practice:

- The browser reaches `https://studio.genlayer.com/api` directly, so the site is only as reachable as Studio is. The contract is public on that chain, so no key is needed to read it.
- Writing still needs the visitor's own wallet on Studionet; the site never holds a key.
- A custom domain works as usual, and nothing in the app depends on the hostname.

## What has not been verified

CI runs contract lint, direct-mode tests (web and LLM mocked), the frontend build and typecheck, the Chromium end-to-end tests in `frontend/e2e/`, and the on-chain suite described in the next section.

- **The frontend in a real browser with a real extension.** `frontend/e2e/` runs Chromium against the app with a fake EIP-6963 wallet: connect, a dismissed prompt, the wrong chain, and form validation. It cannot reproduce what a specific extension does with a real signature.
- **GEN actually landing in a wallet.** The keep-path test proves `withdraw` is accepted and that the `claimable` balance is zeroed. It does not read the recipient's account balance, so a delayed external transfer would not show up.
- **Stability across runs.** Verdicts come from a real model, so a borderline case can be judged differently from one run to the next. What the suite pins down is the list of things that must never happen, at the end of the on-chain section.

## On-chain tests (Studionet)

`tests/integration/test_public_pledge.py` deploys the contract to Studionet and exercises every method with real validators, real web fetches, and real LLM calls:

- **Deploy and views:** `get_config`, `get_pledges`, `get_pledge`, `get_pledge_count`.
- **Main path:** `create_pledge` stores state correctly; then the deadline passes, `judge` returns `kept`, the `claimable` balance grows, and `withdraw` actually moves GEN out of the contract.
- **Adversarial inputs, rejected and not stored:** zero stake, beneficiary equal to the owner, zero-address beneficiary, `http://` URL, overlong URL, deadline in the past, deadline beyond the horizon, blank promise, overlong criteria.
- **Adversarial ordering and authorisation:** `judge` before the deadline, `refund_expired` before the grace period and before any recorded judgement, an unknown pledge id, `withdraw` with an empty balance from another account, and a second `judge` on an already settled pledge (which must not pay twice).
- **Adversarial AI and evidence:** criteria the evidence cannot satisfy must never end as `kept`; a decisive verdict must carry a quote that really occurs on the page; a 404 evidence page is recorded as inconclusive, moves no stake, and still leaves the refund path open.
- **Prompt injection:** the promise and the criteria are attacker-controlled text inside the judge prompt, so two pledges order the judge to answer `kept` (one hides it in the criteria, the other in the promise) for a release the page never shows. Neither may end as `kept` or move the stake.

Running it through GitHub Actions (recommended):

1. Create a throwaway account just for this. Do not reuse a key you use anywhere else.
2. Fund that address with a little GEN on Studionet. Studio's built-in faucet is the droplet button in the account selector at [studio.genlayer.com](https://studio.genlayer.com).
3. In the repo: **Settings → Secrets and variables → Actions → New repository secret**. Name `DEPLOYER_PRIVATE_KEY`, value the test account's private key (`0x...`).
4. Go to **Actions → On-chain checks (Studionet) → Run workflow**.

The workflow also runs automatically when `tests/integration/**`, `contracts/public_pledge.py`, or the workflow itself changes on `main`. The deployed address appears in the job summary and in the log (`PublicPledge deployed at 0x...`).

Running it locally:

```bash
ACCOUNT_PRIVATE_KEY=0x... gltest tests/integration/ -v -s --network studionet
```

Security notes: never commit a private key. `.env` is gitignored, and the workflow writes the key into `.env` from the secret only for the duration of the job. The key is still readable by the GitHub runner and by anyone who can see your job logs, so use a single-use account holding only test GEN, then delete or rotate it.

Coverage note: these tests prove behaviour for the cases above. The AI model can still disagree across runs, so verdicts on borderline cases may vary. What the suite does guarantee is what must never happen: invalid pledges being stored, the stake moving without a verdict, and an unproven promise paying the owner.

Resilience note: Studionet occasionally answers a JSON-RPC request with an HTML error page (`502 Bad Gateway`) instead of JSON, which the SDK reports as `gen_call returned invalid JSON`. Reads are retried with backoff, because a read changes nothing. Writes are deliberately **not** retried: when a submission fails we do not know whether the transaction reached the chain, so repeating it could send a second stake or judge a pledge twice. A transient failure during a write still fails the run, on purpose.

## Layout

```
contracts/public_pledge.py          the contract
tests/direct/                       unit tests, web and LLM mocked
tests/integration/                  on-chain tests on Studionet (real validators and LLM)
.github/workflows/ci.yml            lint, unit tests, frontend build, browser tests
.github/workflows/lockfile.yml      regenerates frontend/package-lock.json
.github/workflows/onchain.yml       deploy and on-chain tests (needs the secret)
gltest.config.yaml                  gltest network configuration
frontend/                           Next.js app
frontend/e2e/                       browser tests with a fake EIP-6963 wallet
requirements.txt                    Python dependencies (versions follow the official boilerplate)
```

## Next

1. Try the frontend with a real wallet against the Studionet deployment. The browser tests use a fake wallet, so how a real extension behaves is still unverified.
2. Add GLSim integration tests for fast iteration without spending GEN.
3. Migrate to `genlayer-js` v2 for Testnet Bradbury, including fee estimation before writing (`estimateTransactionFeesForWrite`) for `create_pledge` (payable, `value` + fee), `judge`, `refund_expired`, and `withdraw`.
