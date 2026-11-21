# Public Pledge

Public commitments staked on GenLayer. Someone writes a promise in plain language, locks GEN behind it, and names one public evidence source. After the deadline, GenLayer validators read that evidence and have to agree on whether the promise was kept.

- Promise kept: the stake goes back to the owner and their public record gains a kept pledge.
- Promise broken: the stake can be claimed by the beneficiary the owner named up front.
- Evidence unreadable or ambiguous: the pledge stays open, and after a grace period the owner can take the stake back.

Status: **contract + direct-mode tests + Next.js frontend**. CI is green for contract lint, 48 direct-mode tests, and the frontend build and typecheck. The on-chain suite exists and runs against Studionet (see below); the frontend has not been tried in a browser with a real wallet yet.

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
- A conclusive verdict (`kept` / `broken`) is rejected unless it carries a verbatim quote of at least 24 characters that really occurs in the page. An invented or paraphrased passage fails with `[LLM_ERROR]`.
- An unreadable evidence source is **recorded as `inconclusive`** rather than reverted, so a dead link leaves an auditable record and can never lock the stake forever. The leader proposes `inconclusive` without asking the model, and a validator agrees with that only when its own fetch fails the same way. If the validator can read the page, the proposal has to survive a real re-judgement.
- Malformed model output (`[LLM_ERROR]`) is deliberately not agreed to, so the leader gets rotated.
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
cp .env.example .env.local     # set NEXT_PUBLIC_CONTRACT_ADDRESS after deploying
npm install
npm run dev
```

Pages: landing (`/`), how it works (`/how-it-works`), pledge list (`/pledges`), pledge detail and consensus result (`/pledges/[id]`), create (`/create`), account and withdrawal (`/account`).

Design notes:

- **No wallet pop-up fights.** Wallets are discovered over EIP-6963 and the user picks one. Every request goes only to that wallet's provider, never to `window.ethereum`. Only one wallet request may be open at a time. Reads never open a wallet.
- **AI consensus data.** Verdict, reason, and check count are read from the `get_pledge` / `get_pledges` views and shown on the detail page and right after `judge`.
- **Transaction status.** A two-step flow, "confirm in your wallet" then "validators reach consensus", with success and error notifications. `ACCEPTED` is not treated as success when the contract execution ended in an error.
- **Networks.** Studionet and Localnet. Bradbury needs SDK v2 and is intentionally not offered.
- **Fees.** SDK 1.1.8 has no fee estimation (that is a v2 API), so the frontend does not send `fees`. That is part of the v2 migration for networks that charge fees.

## What has not been verified

CI runs contract lint, direct-mode tests (web and LLM mocked), and the frontend build and typecheck. The on-chain suite lives in `tests/integration/` and runs through its own workflow (next section).

- **Real validator consensus and a real LLM.** Direct mode uses mocked data. How real validators judge evidence only shows up in the on-chain run.
- **The frontend in a browser.** Wallet connect, network switching, and the transaction dialog have not been exercised with a real wallet.

## On-chain tests (Studionet)

`tests/integration/test_public_pledge.py` deploys the contract to Studionet and exercises every method with real validators, real web fetches, and real LLM calls:

- **Deploy and views:** `get_config`, `get_pledges`, `get_pledge`, `get_pledge_count`.
- **Main path:** `create_pledge` stores state correctly; then the deadline passes, `judge` returns `kept`, the `claimable` balance grows, and `withdraw` actually moves GEN out of the contract.
- **Adversarial inputs, rejected and not stored:** zero stake, beneficiary equal to the owner, zero-address beneficiary, `http://` URL, overlong URL, deadline in the past, deadline beyond the horizon, blank promise, overlong criteria.
- **Adversarial ordering and authorisation:** `judge` before the deadline, `refund_expired` before the grace period and before any recorded judgement, an unknown pledge id, `withdraw` with an empty balance from another account, and a second `judge` on an already settled pledge (which must not pay twice).
- **Adversarial AI and evidence:** criteria the evidence cannot satisfy must never end as `kept`; a decisive verdict must carry a quote that really occurs on the page; a 404 evidence page is recorded as inconclusive, moves no stake, and still leaves the refund path open.

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
.github/workflows/ci.yml            lint, unit tests, frontend build
.github/workflows/onchain.yml       deploy and on-chain tests (needs the secret)
gltest.config.yaml                  gltest network configuration
frontend/                           Next.js app
requirements.txt                    Python dependencies (versions follow the official boilerplate)
```

## Next

1. Put the address from the on-chain workflow into `NEXT_PUBLIC_CONTRACT_ADDRESS`, then try the frontend in a browser with a real wallet.
2. Add GLSim integration tests for fast iteration without spending GEN.
3. Migrate to `genlayer-js` v2 for Testnet Bradbury, including fee estimation before writing (`estimateTransactionFeesForWrite`) for `create_pledge` (payable, `value` + fee), `judge`, `refund_expired`, and `withdraw`.
