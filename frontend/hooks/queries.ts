"use client";

import { useQuery } from "@tanstack/react-query";
import { HAS_CONTRACT } from "@/lib/config";
import { fetchAllPledges, fetchClaimable, fetchPledge, fetchRecord } from "@/lib/contract";

export function usePledges() {
  return useQuery({
    queryKey: ["pledges"],
    queryFn: () => fetchAllPledges(),
    enabled: HAS_CONTRACT,
    refetchInterval: 30_000,
  });
}

export function usePledge(id: number | null) {
  return useQuery({
    queryKey: ["pledge", id],
    queryFn: () => fetchPledge(id as number),
    enabled: HAS_CONTRACT && id !== null,
    refetchInterval: 20_000,
  });
}

export function useAccountData(address: string | null) {
  return useQuery({
    queryKey: ["account", address?.toLowerCase()],
    queryFn: async () => {
      const [claimable, record] = await Promise.all([fetchClaimable(address as string), fetchRecord(address as string)]);
      return { claimable, record };
    },
    enabled: HAS_CONTRACT && !!address,
    refetchInterval: 30_000,
  });
}
