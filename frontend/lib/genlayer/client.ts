import { createClient } from "genlayer-js";
import { CHAIN } from "@/lib/genlayer/chain";
import type { Signer } from "@/lib/genlayer/wallets";

let readClient: ReturnType<typeof createClient> | null = null;

/** Account-free client used for view methods and transaction polling. */
export function getReadClient(): ReturnType<typeof createClient> {
  if (!readClient) readClient = createClient({ chain: CHAIN });
  return readClient;
}

/**
 * Client bound to the user's wallet. We hand the SDK the exact provider the user
 * picked, so it never falls back to window.ethereum and never prompts a second wallet.
 */
export function getWriteClient(signer: Signer): ReturnType<typeof createClient> {
  return createClient({
    chain: CHAIN,
    account: signer.address as `0x${string}`,
    provider: signer.provider as never,
  });
}

export type ReadClient = ReturnType<typeof getReadClient>;
export type ChainTransaction = Awaited<ReturnType<ReadClient["getTransaction"]>>;
