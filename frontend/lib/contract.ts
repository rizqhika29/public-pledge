import { CONTRACT_ADDRESS, HAS_CONTRACT } from "@/lib/config";
import { LIMITS } from "@/lib/constants";
import { NoContractError } from "@/lib/errors";
import { getReadClient } from "@/lib/genlayer/client";
import { toBigInt } from "@/lib/format";
import { parsePage, parsePledge, parseRecord, type AccountRecord, type Pledge } from "@/lib/pledge";

export function requireContract(): `0x${string}` {
  if (!HAS_CONTRACT) throw new NoContractError();
  return CONTRACT_ADDRESS as `0x${string}`;
}

/** Call a view method. Reads go straight to the GenLayer RPC and never open a wallet pop-up. */
async function view(functionName: string, args: Array<string | bigint> = []): Promise<unknown> {
  return getReadClient().readContract({ address: requireContract(), functionName, args });
}

export async function fetchPledgeCount(): Promise<number> {
  return Number(toBigInt(await view("get_pledge_count")));
}

export async function fetchPledge(id: number): Promise<Pledge> {
  return parsePledge(await view("get_pledge", [BigInt(id)]));
}

/** Every pledge, newest first. Pages through the contract's paginated view. */
export async function fetchAllPledges(maxItems = 1000): Promise<Pledge[]> {
  const all: Pledge[] = [];
  let offset = 0;
  let total = Infinity;

  while (offset < total && all.length < maxItems) {
    const page = parsePage(await view("get_pledges", [BigInt(offset), BigInt(LIMITS.pageSize)]));
    total = page.total;
    if (page.items.length === 0) break;
    all.push(...page.items);
    offset += page.items.length;
  }
  return all.sort((a, b) => b.id - a.id);
}

export async function fetchClaimable(account: string): Promise<bigint> {
  return toBigInt(await view("get_claimable", [account]));
}

export async function fetchRecord(account: string): Promise<AccountRecord> {
  return parseRecord(await view("get_record", [account]));
}
