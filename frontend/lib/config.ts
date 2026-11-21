// Plain, dependency-free configuration. Safe to import from server and client code.
//
// This app is built for exactly one deployment, and it reads no runtime value for
// it: the network and the contract address below are constants compiled into the
// bundle. Every visitor talks to the same contract, there is no environment
// variable to set, and there is nothing to point elsewhere at runtime.

/** Networks this codebase can describe. The shipped build is pinned to Studionet. */
export type NetworkKey = "localnet" | "studionet";

export const APP_NAME = "Public Pledge";
export const DOCS_URL = "https://docs.genlayer.com";

/**
 * The one network the app talks to. Bradbury is not offered: it needs the v2 SDK.
 *
 * The `localnet` label and faucet stay in the maps below only so those lookups
 * type-check; the shipped build never resolves to them.
 */
export const NETWORK_KEY: NetworkKey = "studionet";

export const NETWORK_LABEL: Record<NetworkKey, string> = {
  localnet: "Localnet",
  studionet: "Studionet",
};

export const FAUCET: Record<NetworkKey, { label: string; url: string }> = {
  localnet: { label: "Local Studio faucet", url: "http://localhost:8080" },
  studionet: { label: "Studio faucet", url: "https://studio.genlayer.com" },
};

/**
 * The PublicPledge contract this app is built against.
 *
 * Deployed on Studionet (chain id 61999) by `.github/workflows/onchain.yml`, and
 * the same run's on-chain suite passed against it, so the frontend and the tests
 * agree on one contract. Lowercase on purpose: an all-lowercase address is always
 * valid, while a mixed-case one is only valid if its EIP-55 checksum is correct.
 *
 * To move to a new deployment, change this constant and rebuild. It is
 * deliberately not an environment variable: everyone should be on the same one.
 */
export const CONTRACT_ADDRESS = "0xff8764165dc3d35afe8faf7f5b1bc57bc155c798";

/** Guard for a malformed edit above; a released build always passes it. */
export const HAS_CONTRACT = /^0x[0-9a-fA-F]{40}$/.test(CONTRACT_ADDRESS);
