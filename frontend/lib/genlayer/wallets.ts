// Wallet discovery via EIP-6963.
//
// Several wallet extensions inject `window.ethereum` and overwrite one another,
// which is what makes them fight over pop-ups. EIP-6963 lets every wallet
// announce itself separately, so the user picks exactly one and we only ever
// talk to that wallet's own provider.

export type RequestArgs = { method: string; params?: unknown[] | Record<string, unknown> };

export interface Eip1193Provider {
  request(args: RequestArgs): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}

export interface WalletInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

export interface DiscoveredWallet {
  info: WalletInfo;
  provider: Eip1193Provider;
}

/** What the app needs to sign a transaction. */
export interface Signer {
  address: string;
  provider: Eip1193Provider;
}

/** Start listening for wallet announcements. Returns an unsubscribe function. */
export function subscribeWallets(onWallet: (wallet: DiscoveredWallet) => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handler = (event: Event) => {
    const detail = (event as CustomEvent<DiscoveredWallet>).detail;
    if (detail?.info?.rdns && detail.provider) onWallet(detail);
  };

  window.addEventListener("eip6963:announceProvider", handler);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  return () => window.removeEventListener("eip6963:announceProvider", handler);
}

/** Fallback for older wallets that only inject window.ethereum. */
export function legacyInjectedWallet(): DiscoveredWallet | null {
  if (typeof window === "undefined") return null;
  const injected = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
  if (!injected) return null;
  return {
    info: { uuid: "legacy-injected", name: "Browser wallet", icon: "", rdns: "legacy.injected" },
    provider: injected,
  };
}
