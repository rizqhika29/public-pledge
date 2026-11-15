"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import { ConfigNotice, ErrorPanel, PageHeader } from "@/components/feedback";
import { PledgeCard } from "@/components/PledgeBits";
import { EmptyState, Skeleton, buttonClass } from "@/components/ui";
import { usePledges } from "@/hooks/queries";
import { useNow } from "@/hooks/useNow";
import { HAS_CONTRACT } from "@/lib/config";
import { useWallet } from "@/lib/genlayer/WalletProvider";
import { getPhase, type Pledge } from "@/lib/pledge";
import { cn, sameAddress } from "@/lib/utils";

type Filter = "all" | "open" | "ready" | "settled" | "mine";

const FILTERS: ReadonlyArray<{ key: Filter; label: string }> = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "ready", label: "Ready for judgement" },
  { key: "settled", label: "Settled" },
  { key: "mine", label: "Mine" },
];

export function PledgesBrowser() {
  const query = usePledges();
  const now = useNow();
  const wallet = useWallet();
  const [filter, setFilter] = useState<Filter>("all");

  const visible = useMemo(() => {
    const all = query.data ?? [];
    if (now === null) return [] as Pledge[];
    return all.filter((p) => {
      const phase = getPhase(p, now);
      switch (filter) {
        case "open":
          return phase === "open";
        case "ready":
          return phase === "ready" || phase === "refundable";
        case "settled":
          return phase === "kept" || phase === "broken" || phase === "refunded";
        case "mine":
          return sameAddress(p.owner, wallet.address) || sameAddress(p.beneficiary, wallet.address);
        default:
          return true;
      }
    });
  }, [query.data, now, filter, wallet.address]);

  const loading = query.isLoading || now === null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <PageHeader
        title="Pledges"
        subtitle="Every promise staked on this contract, read live from GenLayer. Open one to see its criteria, evidence, and the validators' verdict."
        actions={
          <Link href="/create" className={buttonClass("primary", "md")}>
            New pledge
          </Link>
        }
      />

      <div className="mb-6">
        <ConfigNotice />
      </div>

      {HAS_CONTRACT && (
        <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="Filter pledges">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              role="tab"
              aria-selected={filter === item.key}
              onClick={() => setFilter(item.key)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                filter === item.key ? "border-brand-500 bg-brand-500/15 text-white" : "border-ink-600 text-zinc-400 hover:text-white",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {HAS_CONTRACT && query.isError ? (
        <ErrorPanel error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />
      ) : loading && HAS_CONTRACT ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-56" />
          ))}
        </div>
      ) : HAS_CONTRACT && visible.length === 0 ? (
        <EmptyState icon={<FileText className="h-8 w-8" />} title={(query.data ?? []).length === 0 ? "No pledges yet" : "Nothing matches this filter"}>
          {(query.data ?? []).length === 0 ? (
            <>
              Be the first to put a promise on the record.{" "}
              <Link href="/create" className="text-brand-300 underline underline-offset-2">
                Make a pledge
              </Link>
              .
            </>
          ) : filter === "mine" && !wallet.address ? (
            "Connect your wallet to see pledges you made or that name you as beneficiary."
          ) : (
            "Try another filter."
          )}
        </EmptyState>
      ) : HAS_CONTRACT && now !== null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((pledge) => (
            <PledgeCard key={pledge.id} pledge={pledge} now={now} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
