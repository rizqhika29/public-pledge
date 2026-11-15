"use client";

import { Gavel, Undo2 } from "lucide-react";
import { Button } from "@/components/ui";
import { useTx, type TxResult } from "@/components/TxProvider";
import { useWallet } from "@/lib/genlayer/WalletProvider";
import { fetchPledge } from "@/lib/contract";
import { getPhase, type Pledge } from "@/lib/pledge";
import { formatDuration } from "@/lib/format";

/** Turn the freshly read pledge into a headline the user can understand right after judgement. */
function describeVerdict(p: Pledge): TxResult {
  if (p.status === "kept") {
    return {
      tone: "good",
      headline: "Verdict: promise kept",
      detail: `${p.note || "Validators found the evidence satisfies the criteria."} The stake is now claimable by the owner.`,
    };
  }
  if (p.status === "broken") {
    return {
      tone: "bad",
      headline: "Verdict: promise broken",
      detail: `${p.note || "Validators found the evidence does not satisfy the criteria."} The beneficiary can now claim the stake.`,
    };
  }
  return {
    tone: "neutral",
    headline: "Inconclusive: no verdict yet",
    detail: `${p.note || "The evidence was missing or unclear."} The pledge stays open and can be judged again, for example after the evidence page is fixed.`,
  };
}

export function PledgeActions({ pledge, now }: { pledge: Pledge; now: number }) {
  const w = useWallet();
  const tx = useTx();
  const phase = getPhase(pledge, now);
  const disabled = tx.active || w.isBusy;

  if (phase === "kept" || phase === "broken" || phase === "refunded") return null;

  if (phase === "open") {
    return (
      <p className="rounded-xl border border-ink-700 bg-ink-900 p-4 text-sm text-zinc-400">
        Judgement opens when the deadline passes, in {formatDuration(pledge.deadline - now)}. Anyone can then ask the validators to examine the evidence.
      </p>
    );
  }

  function judge() {
    if (!w.address) return w.openModal();
    void tx.run({
      title: `Judge pledge #${pledge.id}`,
      functionName: "judge",
      args: [BigInt(pledge.id)],
      consensusHint:
        "Validators each fetch the evidence page and ask their AI whether the promise was kept. They must agree on the verdict.",
      successTitle: "Validators reached a decision",
      afterSuccess: async () => describeVerdict(await fetchPledge(pledge.id)),
    });
  }

  function refund() {
    if (!w.address) return w.openModal();
    void tx.run({
      title: `Refund pledge #${pledge.id}`,
      functionName: "refund_expired",
      args: [BigInt(pledge.id)],
      consensusHint: "The contract checks that the judgement window has passed. No AI is involved.",
      successTitle: "Stake returned",
      afterSuccess: async () => ({
        tone: "good",
        headline: "Stake returned to the owner",
        detail: "It is now in the owner's claimable balance. No verdict was recorded and reputation is unchanged.",
      }),
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <Button onClick={judge} disabled={disabled}>
          <Gavel className="h-4 w-4" aria-hidden />
          {w.address ? "Ask validators to judge" : "Connect wallet to judge"}
        </Button>
        {phase === "refundable" && (
          <Button variant="secondary" onClick={refund} disabled={disabled}>
            <Undo2 className="h-4 w-4" aria-hidden />
            Return stake to owner
          </Button>
        )}
      </div>
      <p className="text-xs text-zinc-500">
        Anyone can trigger judgement; the result is decided by validator consensus, not by the caller.
        {phase === "refundable" && " The judgement window has passed without a verdict, so the owner can take the stake back. Anyone may trigger that too."}
      </p>
    </div>
  );
}
