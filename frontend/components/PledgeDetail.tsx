"use client";

import Link from "next/link";
import { ArrowLeft, CircleCheck, CircleHelp, CircleX, ExternalLink, Hourglass, Undo2 } from "lucide-react";
import { ConfigNotice, ErrorPanel } from "@/components/feedback";
import { PledgeActions } from "@/components/PledgeActions";
import { AddressChip, Fact, StatusBadge, deadlineLabel } from "@/components/PledgeBits";
import { Card, Skeleton } from "@/components/ui";
import { usePledge } from "@/hooks/queries";
import { useNow } from "@/hooks/useNow";
import { HAS_CONTRACT, CONTRACT_ADDRESS } from "@/lib/config";
import { formatDateTime, formatGen } from "@/lib/format";
import { getPhase, isHttpsUrl, type Pledge } from "@/lib/pledge";
import { cn, shortAddress } from "@/lib/utils";

function VerdictPanel({ pledge }: { pledge: Pledge }) {
  const { status, checks, note } = pledge;

  let icon = <Hourglass className="h-6 w-6 text-zinc-400" aria-hidden />;
  let tone = "border-ink-700 bg-ink-900/60";
  let title = "Not judged yet";
  let body = "Validators have not examined the evidence. Judgement opens after the deadline.";

  if (status === "kept") {
    icon = <CircleCheck className="h-6 w-6 text-emerald-400" aria-hidden />;
    tone = "border-emerald-500/30 bg-emerald-500/10";
    title = "Validators agreed: promise kept";
    body = "The evidence satisfied the criteria. The owner can take the stake back.";
  } else if (status === "broken") {
    icon = <CircleX className="h-6 w-6 text-rose-400" aria-hidden />;
    tone = "border-rose-500/30 bg-rose-500/10";
    title = "Validators agreed: promise broken";
    body = "The evidence did not satisfy the criteria. The beneficiary can claim the stake.";
  } else if (status === "refunded") {
    icon = <Undo2 className="h-6 w-6 text-zinc-300" aria-hidden />;
    tone = "border-zinc-500/30 bg-zinc-500/10";
    title = "Stake returned, no verdict";
    body = "No conclusive verdict was reached within the judgement window, so the stake went back to the owner. Records are unchanged.";
  } else if (checks > 0) {
    icon = <CircleHelp className="h-6 w-6 text-amber-400" aria-hidden />;
    tone = "border-amber-500/30 bg-amber-500/10";
    title = `Inconclusive after ${checks} ${checks === 1 ? "check" : "checks"}`;
    body = "The evidence was missing or unclear, so nothing was settled. The pledge is still open and can be judged again.";
  }

  return (
    <Card className={cn("p-5", tone)}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <div className="min-w-0">
          <h2 className="font-semibold text-white">{title}</h2>
          <p className="mt-1 text-sm text-zinc-300">{body}</p>
          {note && (
            <blockquote className="mt-3 border-l-2 border-ink-500 pl-3 text-sm italic text-zinc-300">
              {note}
              <footer className="mt-1 text-xs not-italic text-zinc-500">
                Verdict reasoning. Validators agreed on the verdict itself; their own wording may differ.
              </footer>
            </blockquote>
          )}
          {pledge.evidenceQuote && (
            <figure className="mt-3 rounded-lg border border-ink-600 bg-ink-950 p-3">
              <figcaption className="text-xs uppercase tracking-wide text-zinc-500">
                Passage from the evidence that decided it
              </figcaption>
              <blockquote className="mt-2 break-words font-mono text-xs leading-relaxed text-zinc-300">
                {pledge.evidenceQuote}
              </blockquote>
            </figure>
          )}
          {checks > 0 && <p className="mt-3 text-xs text-zinc-500">Shows the latest accepted state. A decision can be appealed until it is finalized.</p>}
        </div>
      </div>
    </Card>
  );
}

export function PledgeDetail({ rawId }: { rawId: string }) {
  const id = /^\d{1,9}$/.test(rawId) ? Number(rawId) : null;
  const query = usePledge(id);
  const now = useNow();

  const back = (
    <Link href="/pledges" className="mb-6 inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white">
      <ArrowLeft className="h-4 w-4" aria-hidden />
      All pledges
    </Link>
  );

  if (id === null) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        {back}
        <ErrorPanel error={new Error("[EXPECTED] pledge not found")} />
      </div>
    );
  }

  if (!HAS_CONTRACT) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        {back}
        <ConfigNotice />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        {back}
        <ErrorPanel error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />
      </div>
    );
  }

  const pledge = query.data;
  if (!pledge || now === null) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        {back}
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="mt-6 h-40" />
        <Skeleton className="mt-4 h-32" />
      </div>
    );
  }

  const phase = getPhase(pledge, now);
  const evidenceOk = isHttpsUrl(pledge.evidenceUrl);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      {back}

      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-sm text-zinc-500">Pledge #{pledge.id}</span>
        <StatusBadge phase={phase} />
        <span className="text-sm text-zinc-400">{deadlineLabel(pledge, now)}</span>
      </div>
      <h1 className="mt-4 text-2xl font-bold leading-snug text-white sm:text-3xl">{pledge.promise}</h1>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">How it will be judged</h2>
            <p className="mt-3 whitespace-pre-wrap text-zinc-200">{pledge.criteria}</p>
            <div className="mt-5 border-t border-ink-700 pt-4">
              <h3 className="text-xs uppercase tracking-wide text-zinc-500">Evidence validators read</h3>
              {evidenceOk ? (
                <a
                  href={pledge.evidenceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex max-w-full items-center gap-1.5 break-all text-sm text-brand-300 hover:text-brand-400"
                >
                  {pledge.evidenceUrl}
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                </a>
              ) : (
                <p className="mt-1 break-all text-sm text-zinc-300">{pledge.evidenceUrl}</p>
              )}
            </div>
          </Card>

          <VerdictPanel pledge={pledge} />

          <PledgeActions pledge={pledge} now={now} />
        </div>

        <aside>
          <Card className="p-5">
            <dl className="space-y-5">
              <Fact label="Staked">
                <span className="text-xl font-semibold text-white">{formatGen(pledge.stake)} GEN</span>
              </Fact>
              <Fact label="Owner">
                <AddressChip address={pledge.owner} />
              </Fact>
              <Fact label="Beneficiary if broken">
                <AddressChip address={pledge.beneficiary} />
              </Fact>
              <Fact label="Created">{formatDateTime(pledge.createdAt)}</Fact>
              <Fact label="Deadline">{formatDateTime(pledge.deadline)}</Fact>
              <Fact label="Validator checks">{pledge.checks}</Fact>
              {HAS_CONTRACT && (
                <Fact label="Contract">
                  <span className="font-mono text-xs" title={CONTRACT_ADDRESS}>
                    {shortAddress(CONTRACT_ADDRESS, 8, 6)}
                  </span>
                </Fact>
              )}
            </dl>
          </Card>
        </aside>
      </div>
    </div>
  );
}
