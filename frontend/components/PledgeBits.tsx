"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Clock } from "lucide-react";
import { Card } from "@/components/ui";
import { PHASE_LABEL, getPhase, type Pledge, type PledgePhase } from "@/lib/pledge";
import { formatDate, formatDuration, formatGen } from "@/lib/format";
import { cn, sameAddress, shortAddress } from "@/lib/utils";
import { useWallet } from "@/lib/genlayer/WalletProvider";

const PHASE_STYLE: Record<PledgePhase, string> = {
  open: "border-brand-500/40 bg-brand-500/10 text-brand-300",
  ready: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  refundable: "border-orange-500/40 bg-orange-500/10 text-orange-300",
  kept: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  broken: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  refunded: "border-zinc-500/40 bg-zinc-500/10 text-zinc-300",
};

export function StatusBadge({ phase }: { phase: PledgePhase }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", PHASE_STYLE[phase])}>
      {PHASE_LABEL[phase]}
    </span>
  );
}

export function deadlineLabel(p: Pledge, now: number): string {
  const phase = getPhase(p, now);
  if (phase === "open") return `Ends in ${formatDuration(p.deadline - now)}`;
  if (phase === "ready") return `Ended ${formatDuration(now - p.deadline)} ago`;
  if (phase === "refundable") return "Judgement window passed";
  return `Ended ${formatDate(p.deadline)}`;
}

export function AddressChip({ address }: { address: string }) {
  const { address: me } = useWallet();
  return (
    <span className="inline-flex items-center gap-1.5" title={address}>
      <span className="font-mono text-xs">{shortAddress(address)}</span>
      {sameAddress(address, me) && <span className="rounded bg-brand-500/20 px-1.5 text-[10px] font-medium uppercase tracking-wide text-brand-300">you</span>}
    </span>
  );
}

export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-1 text-sm text-zinc-100">{children}</dd>
    </div>
  );
}

export function PledgeCard({ pledge, now }: { pledge: Pledge; now: number }) {
  const phase = getPhase(pledge, now);
  return (
    <Link href={`/pledges/${pledge.id}`} className="group block h-full">
      <Card className="flex h-full flex-col p-5 transition-colors group-hover:border-brand-500/60">
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-xs text-zinc-500">#{pledge.id}</span>
          <StatusBadge phase={phase} />
        </div>
        <p className="mt-3 line-clamp-3 flex-1 text-base font-medium text-white">{pledge.promise}</p>
        <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-ink-700 pt-4">
          <Fact label="Staked">
            <span className="font-semibold">{formatGen(pledge.stake)} GEN</span>
          </Fact>
          <Fact label="By">
            <AddressChip address={pledge.owner} />
          </Fact>
        </dl>
        <p className="mt-4 flex items-center gap-1.5 text-xs text-zinc-400">
          <Clock className="h-3.5 w-3.5" aria-hidden />
          {deadlineLabel(pledge, now)}
        </p>
      </Card>
    </Link>
  );
}
