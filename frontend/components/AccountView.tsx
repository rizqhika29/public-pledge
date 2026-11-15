"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { Banknote, FileText, Wallet } from "lucide-react";
import { ConfigNotice, ErrorPanel, PageHeader } from "@/components/feedback";
import { PledgeCard } from "@/components/PledgeBits";
import { useTx } from "@/components/TxProvider";
import { Button, Card, EmptyState, Skeleton } from "@/components/ui";
import { useAccountData, usePledges } from "@/hooks/queries";
import { useNow } from "@/hooks/useNow";
import { HAS_CONTRACT } from "@/lib/config";
import { formatGen } from "@/lib/format";
import { useWallet } from "@/lib/genlayer/WalletProvider";
import { keptRate } from "@/lib/pledge";
import { sameAddress } from "@/lib/utils";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-ink-700 bg-ink-900/60 px-5 py-4">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

export function AccountView() {
  const wallet = useWallet();
  const tx = useTx();
  const now = useNow();
  const account = useAccountData(wallet.address);
  const pledges = usePledges();

  const mine = useMemo(() => (pledges.data ?? []).filter((p) => sameAddress(p.owner, wallet.address)), [pledges.data, wallet.address]);
  const named = useMemo(
    () => (pledges.data ?? []).filter((p) => sameAddress(p.beneficiary, wallet.address) && !sameAddress(p.owner, wallet.address)),
    [pledges.data, wallet.address],
  );

  const shell = (children: ReactNode) => (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <PageHeader title="My account" subtitle="Your pledges, your record, and the balance you can withdraw." />
      {children}
    </div>
  );

  if (!HAS_CONTRACT) return shell(<ConfigNotice />);

  if (wallet.status === "initializing") return shell(<Skeleton className="h-40" />);

  if (!wallet.address) {
    return shell(
      <EmptyState icon={<Wallet className="h-8 w-8" />} title="Connect your wallet">
        <p>Connect a wallet to see your pledges, your kept and broken record, and any GEN waiting to be withdrawn.</p>
        <Button className="mt-5" onClick={wallet.openModal} loading={wallet.status === "connecting"}>
          Connect wallet
        </Button>
      </EmptyState>,
    );
  }

  const claimable = account.data?.claimable ?? 0n;
  const record = account.data?.record;
  const rate = record ? keptRate(record) : null;
  const busy = tx.active || wallet.isBusy;

  function withdraw() {
    void tx.run({
      title: "Withdraw balance",
      functionName: "withdraw",
      args: [],
      consensusHint: "The contract zeroes your balance and queues the transfer. No AI is involved.",
      successTitle: "Withdrawal submitted",
      afterSuccess: async () => ({
        tone: "good",
        headline: `${formatGen(claimable)} GEN on its way`,
        detail:
          "The transfer is sent to your wallet when the transaction is finalized, after the appeal window closes. Your claimable balance is already zero.",
      }),
    });
  }

  return shell(
    <div className="space-y-10">
      {account.isError ? (
        <ErrorPanel error={account.error} onRetry={() => void account.refetch()} retrying={account.isFetching} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {account.isLoading ? (
            Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24" />)
          ) : (
            <>
              <Stat label="Pledges kept" value={String(record?.kept ?? 0)} />
              <Stat label="Pledges broken" value={String(record?.broken ?? 0)} />
              <Stat label="Kept rate" value={rate === null ? "—" : `${rate}%`} hint={rate === null ? "No judged pledges yet" : undefined} />
              <Stat label="Claimable" value={`${formatGen(claimable)} GEN`} />
            </>
          )}
        </div>
      )}

      {claimable > 0n && (
        <Card className="flex flex-wrap items-center justify-between gap-4 border-emerald-500/30 bg-emerald-500/10 p-5">
          <div className="flex items-start gap-3">
            <Banknote className="mt-0.5 h-6 w-6 shrink-0 text-emerald-300" aria-hidden />
            <div>
              <p className="font-semibold text-white">{formatGen(claimable)} GEN is ready to withdraw</p>
              <p className="mt-1 text-sm text-zinc-300">Settled stakes wait here until you withdraw them. The transfer arrives once the transaction is finalized.</p>
            </div>
          </div>
          <Button onClick={withdraw} disabled={busy}>
            Withdraw {formatGen(claimable)} GEN
          </Button>
        </Card>
      )}

      <section aria-labelledby="mine">
        <h2 id="mine" className="mb-4 text-xl font-semibold text-white">
          Your pledges
        </h2>
        {pledges.isError ? (
          <ErrorPanel error={pledges.error} onRetry={() => void pledges.refetch()} retrying={pledges.isFetching} />
        ) : pledges.isLoading || now === null ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-56" />
            <Skeleton className="h-56" />
          </div>
        ) : mine.length === 0 ? (
          <EmptyState icon={<FileText className="h-8 w-8" />} title="You have not made a pledge yet">
            <Link href="/create" className="text-brand-300 underline underline-offset-2">
              Make your first pledge
            </Link>
          </EmptyState>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {mine.map((pledge) => (
              <PledgeCard key={pledge.id} pledge={pledge} now={now} />
            ))}
          </div>
        )}
      </section>

      {named.length > 0 && now !== null && (
        <section aria-labelledby="named">
          <h2 id="named" className="mb-1 text-xl font-semibold text-white">
            Named you as beneficiary
          </h2>
          <p className="mb-4 text-sm text-zinc-400">If a pledge below is judged broken, its stake becomes claimable by you.</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {named.map((pledge) => (
              <PledgeCard key={pledge.id} pledge={pledge} now={now} />
            ))}
          </div>
        </section>
      )}
    </div>,
  );
}
