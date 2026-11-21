import { TxFailedError, extractContractReason, contractReasonMessage } from "@/lib/errors";
import { requireContract } from "@/lib/contract";
import { getReadClient, getWriteClient } from "@/lib/genlayer/client";
import { rpcClear } from "@/lib/genlayer/rpc";
import type { Signer } from "@/lib/genlayer/wallets";

export type TxPhase = "wallet" | "consensus";

export interface TxControl {
  setPhase(phase: TxPhase): void;
  setHash(hash: string): void;
}

export interface WriteParams {
  signer: Signer;
  functionName: string;
  args: Array<string | bigint>;
  /** GEN (in wei) sent with a payable method. */
  value?: bigint;
  ctl: TxControl;
}

// A transaction in one of these states did not produce a usable decision.
const NO_DECISION = new Set(["UNDETERMINED", "CANCELED", "LEADER_TIMEOUT", "VALIDATORS_TIMEOUT"]);

function stringify(value: unknown): string {
  try {
    return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v)) ?? "";
  } catch {
    return "";
  }
}

function firstLeaderReceipt(receipt: Record<string, unknown>): Record<string, unknown> | undefined {
  const data = receipt.consensus_data as { leader_receipt?: unknown } | undefined;
  const list = data?.leader_receipt;
  const first = Array.isArray(list) ? list[0] : list;
  return first && typeof first === "object" ? (first as Record<string, unknown>) : undefined;
}

/**
 * Turn a consensus receipt into success or a descriptive failure.
 * "ACCEPTED" only means validators agreed on an outcome, and an agreed outcome can still be an error.
 */
function verifyReceipt(receipt: unknown, hash: string): void {
  const r = (receipt && typeof receipt === "object" ? receipt : {}) as Record<string, unknown>;

  const status = String(r.statusName ?? r.status_name ?? r.status ?? "").toUpperCase();
  if (NO_DECISION.has(status)) {
    throw new TxFailedError(
      "Validators could not reach a decision, so nothing was changed. This can happen when the evidence page changes between reads. Try again.",
      hash,
      "consensus",
    );
  }

  const leader = firstLeaderReceipt(r);
  const executionName = String(r.txExecutionResultName ?? "").toUpperCase();
  const leaderResult = String(leader?.execution_result ?? "").toUpperCase();
  const decoded = leader?.result as { status?: unknown } | undefined;
  const decodedStatus = String(decoded?.status ?? "").toLowerCase();
  const failed =
    executionName === "FINISHED_WITH_ERROR" ||
    leaderResult === "ERROR" ||
    ["rollback", "contract_error", "error"].includes(decodedStatus);

  if (failed) {
    const tagged = extractContractReason(stringify(leader ?? r));
    throw new TxFailedError(
      tagged ? contractReasonMessage(tagged.tag, tagged.reason) : "The contract rejected this action. Nothing was changed.",
      hash,
      "contract",
    );
  }
}

/**
 * Sign and send one write, then wait until the validators decide.
 * Exactly one wallet request is made; everything after is read-only polling.
 */
export async function submitWrite({ signer, functionName, args, value = 0n, ctl }: WriteParams): Promise<{ hash: string }> {
  const address = requireContract();

  ctl.setPhase("wallet");
  const hash = String(await getWriteClient(signer).writeContract({ address, functionName, args, value }));

  // From here on a transaction ID exists. Never resend: the first write may already be executing.
  ctl.setHash(hash);
  ctl.setPhase("consensus");

  try {
    const receipt = await getReadClient().waitForTransactionReceipt({
      hash: hash as never,
      status: "ACCEPTED" as never,
      interval: 3000,
      retries: 120,
    });
    verifyReceipt(receipt, hash);
    // Every read cached before this point describes the state before it.
    rpcClear();
  } catch (error) {
    if (error instanceof TxFailedError) throw error;
    throw new TxFailedError(
      "Your transaction was submitted, but we lost track of it before validators finished. Do not send it again. Refresh in a minute to see whether it went through.",
      hash,
      "timeout",
    );
  }

  return { hash };
}
