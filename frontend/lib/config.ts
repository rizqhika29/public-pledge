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

export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "").trim();
export const HAS_CONTRACT = /^0x[0-9a-fA-F]{40}$/.test(CONTRACT_ADDRESS);
