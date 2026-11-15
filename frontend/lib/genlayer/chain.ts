import { localnet, studionet } from "genlayer-js/chains";
import { NETWORK_KEY } from "@/lib/config";

const CHAINS = { localnet, studionet } as const;

/** The GenLayer chain definition the whole app is bound to (chosen at build time). */
export const CHAIN = CHAINS[NETWORK_KEY];
export const CHAIN_ID: number = CHAIN.id;
export const CHAIN_ID_HEX = `0x${CHAIN.id.toString(16)}`;

/** Parameters for wallet_addEthereumChain, derived from the SDK's chain definition. */
export function walletChainParams() {
  const explorer = CHAIN.blockExplorers?.default?.url;
  return {
    chainId: CHAIN_ID_HEX,
    chainName: CHAIN.name,
    nativeCurrency: {
      name: CHAIN.nativeCurrency.name,
      symbol: CHAIN.nativeCurrency.symbol,
      decimals: CHAIN.nativeCurrency.decimals,
    },
    rpcUrls: [...CHAIN.rpcUrls.default.http],
    ...(explorer ? { blockExplorerUrls: [explorer] } : {}),
  };
}
