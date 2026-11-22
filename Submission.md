# PROJECT SUMMARY

## One-liner

Lock GEN behind a promise. After the deadline, GenLayer validators read the public evidence and must agree on whether you kept it. Kept returns your stake; broken pays out.

---

# 03 PROJECT OVERVIEW

## Description

Public promises are cheap because nobody checks them. Public Pledge turns one into a stake: write the promise, name a public evidence page and the criteria a stranger could check, lock GEN behind it, and choose who receives it if you fail.

After the deadline anyone can call `judge()`. The leader fetches the evidence inside the contract, asks an LLM for a verdict, and must copy a verbatim passage from that page. Every validator fetches the page itself, re-runs the question, requires the leader's quote to appear in what it fetched, and must reach the same verdict. An invented or paraphrased quote can never pay out.

`kept` returns the stake and marks the record; `broken` pays the beneficiary; `inconclusive` keeps the pledge open. A page that cannot be read is recorded, never a revert, so a dead link cannot lock funds. Settlement is a pull payment, so a failed transfer cannot block a verdict.

The owner still picks the evidence source, so third-party pages are recommended.

---

# 04 DEMO VIDEO

## Demo URL (YouTube or X) — optional

_(to be recorded)_

Suggested 90-second script: connect a wallet on Studionet, create a pledge with a deadline minutes away and a public evidence page, press Judge after the deadline, show the verdict with the quoted passage, then Withdraw. End on the explorer link showing the same transaction.

---

# 05 HOW-TO

## Try it in five steps

1. Open <https://public-pledge.vercel.app>. Browsing works without a wallet: the list, every pledge and every verdict are read straight from the contract.
2. Connect a wallet that is on **Studionet (chain 61999)**. If it has no GEN, take test GEN from the faucet at <https://studio.genlayer.com>.
3. Go to **Make a pledge**. Write the promise, the criteria a stranger could check, and an evidence page you do not control (a GitHub release, an official notice). Choose a beneficiary wallet, a stake and a deadline at least 15 minutes ahead.
4. After the deadline, open the pledge and press **Judge**. Your wallet signs one transaction; validators then fetch the page and vote, which usually takes a minute or more.
5. Read the verdict, the validators' note and the exact passage they accepted. If it is `kept`, press **Withdraw** to pull the stake out. If it is `broken`, the beneficiary withdraws.

---

# 06 REVIEW VERIFICATION

## Expected verification outcome

No wallet is needed to check the reads: the pledge list is read live from the contract (9 pledges when this was written), and every pledge shows its criteria, evidence link, verdict, the validators' note and the passage they accepted.

Writing needs test GEN on Studionet (chain 61999). Create a pledge with a deadline at least 15 minutes ahead and an evidence page you do not control, then press Judge after the deadline: the transaction is reported as success only once validators agree.

The explorer link shows the deployed code and the six read methods.

## Contract link 1 (optional)

<https://explorer-studio.genlayer.com/contracts/0xfF8764165DC3D35AFe8faF7f5B1bC57bc155c798>

---

# PROJECT LINKS

## Website — required

<https://public-pledge.vercel.app>

## GitHub

<https://github.com/rizqhika29/public-pledge>
