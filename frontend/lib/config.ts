// Plain, dependency-free configuration. Safe to import from server and client code.

// Only networks the pinned SDK (genlayer-js 1.1.8) supports end to end.
// Testnet Bradbury (Phase 2) needs the v2 SDK, so it is intentionally not offered here.
export type NetworkKey = "localnet" | "studionet";

const NETWORK_KEYS: readonly NetworkKey[] = ["localnet", "studionet"];

function resolveNetwork(value: string | undefined): NetworkKey {
  const v = (value ?? "").trim();
  return (NETWORK_KEYS as readonly string[]).includes(v) ? (v as NetworkKey) : "studionet";
}

export const APP_NAME = "Public Pledge";
export const DOCS_URL = "https://docs.genlayer.com";

export const NETWORK_KEY: NetworkKey = resolveNetwork(process.env.NEXT_PUBLIC_GENLAYER_NETWORK);

export const NETWORK_LABEL: Record<NetworkKey, string> = {
  localnet: "Localnet",
  studionet: "Studionet",
};

export const FAUCET: Record<NetworkKey, { label: string; url: string }> = {
  localnet: { label: "Local Studio faucet", url: "http://localhost:8080" },
  studionet: { label: "Studio faucet", url: "https://studio.genlayer.com" },
};

// The contract the on-chain workflow last deployed to Studionet
// (.github/workflows/onchain.yml prints it in the job summary). It is a default
// only, so `npm run dev` works with no setup at all: NEXT_PUBLIC_CONTRACT_ADDRESS
// always wins. Localnet has no fallback, because there each user deploys their
// own contract and any fixed address would be wrong.
// Lowercase on purpose: an all-lowercase address is always valid, while a
// mixed-case one is only valid if its EIP-55 checksum is correct.
const DEPLOYED_ON_STUDIONET = "0x945ebf6cb2109ed732318019b2fc9d1513ab2f54";

const CONTRACT_FALLBACK: Record<NetworkKey, string> = {
  studionet: DEPLOYED_ON_STUDIONET,
  localnet: "",
};

const CONFIGURED_CONTRACT = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "").trim();

export const CONTRACT_ADDRESS = CONFIGURED_CONTRACT || CONTRACT_FALLBACK[NETWORK_KEY];
export const HAS_CONTRACT = /^0x[0-9a-fA-F]{40}$/.test(CONTRACT_ADDRESS);
