"use client";

import { Skeleton } from "@/components/ui";
import { usePledges } from "@/hooks/queries";
import { HAS_CONTRACT } from "@/lib/config";
import { formatGen } from "@/lib/format";

function Stat({ label, value, loading }: { label: string; value: string; loading: boolean }) {
  return (
    <div className="rounded-2xl border border-ink-700 bg-ink-900/60 px-5 py-4">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      {loading ? <Skeleton className="mt-2 h-8 w-24" /> : <p className="mt-1 text-2xl font-semibold text-white">{value}</p>}
    </div>
  );
}

/** Live numbers read straight from the contract. Hidden when there is nothing to read. */
export function LiveStats() {
  const query = usePledges();
  if (!HAS_CONTRACT || query.isError) return null;

  const pledges = query.data ?? [];
  const staked = pledges.filter((p) => p.status === "active").reduce((sum, p) => sum + p.stake, 0n);
  const kept = pledges.filter((p) => p.status === "kept").length;
  const broken = pledges.filter((p) => p.status === "broken").length;
  const loading = query.isLoading;

  return (
    <section aria-label="Live on-chain stats" className="mx-auto max-w-6xl px-4 sm:px-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Pledges made" value={String(pledges.length)} loading={loading} />
        <Stat label="GEN at stake now" value={formatGen(staked)} loading={loading} />
        <Stat label="Judged kept" value={String(kept)} loading={loading} />
        <Stat label="Judged broken" value={String(broken)} loading={loading} />
      </div>
    </section>
  );
}
