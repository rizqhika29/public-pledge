import type { Page } from "@playwright/test";

/** The account the fake wallet reports. */
export const MOCK_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";
/** How `shortAddress(MOCK_ADDRESS)` renders in the UI. */
export const SHORT_ADDRESS = "0x1234…5678";
/** Studionet, the chain this app is built for by default. */
export const STUDIONET_CHAIN_ID = 61999;

export interface MockWalletOptions {
  /** Chain the wallet reports before the app asks it to switch. Default Studionet. */
  chainId?: number;
  /** Fail eth_requestAccounts with EIP-1193 4001, as a dismissed prompt does. */
  rejectConnect?: boolean;
}

// A type alias, not an interface: Playwright's `Serializable` argument type only
// accepts an implicit index signature from type aliases.
type MockWalletConfig = {
  chainId: number;
  rejectConnect: boolean;
  address: string;
  rdns: string;
};

/**
 * Install a fake EIP-6963 wallet before the app boots.
 *
 * It answers only the methods this app uses, so the tests can assert on what the
 * app does with a wallet - which one it contacts, what it shows when a prompt is
 * dismissed, how it reacts to the wrong chain - without a browser extension and
 * without a private key. Anything unexpected is recorded in
 * `window.__walletCalls`, so a test can prove a call was made (or was not).
 */
export async function installMockWallet(
  page: Page,
  options: MockWalletOptions = {},
): Promise<void> {
  const config: MockWalletConfig = {
    chainId: options.chainId ?? STUDIONET_CHAIN_ID,
    rejectConnect: options.rejectConnect ?? false,
    address: MOCK_ADDRESS,
    rdns: "dev.mockwallet",
  };

  await page.addInitScript((cfg) => {
    type Handler = (...args: unknown[]) => void;
    type Scope = { __walletCalls: string[]; __walletChainId: number };

    let chainId = cfg.chainId;
    const calls: string[] = [];
    const listeners: Record<string, Handler[]> = {};

    const scope = window as unknown as Scope;
    scope.__walletCalls = calls;
    scope.__walletChainId = chainId;

    const provider = {
      async request({
        method,
        params,
      }: {
        method: string;
        params?: unknown;
      }): Promise<unknown> {
        calls.push(method);

        switch (method) {
          case "eth_requestAccounts":
            if (cfg.rejectConnect) {
              // The shape MetaMask throws when the user dismisses the prompt.
              throw Object.assign(new Error("User rejected the request."), { code: 4001 });
            }
            return [cfg.address];
          case "eth_accounts":
            return [cfg.address];
          case "eth_chainId":
            return `0x${chainId.toString(16)}`;
          case "wallet_switchEthereumChain": {
            const requested = Array.isArray(params)
              ? (params[0] as { chainId?: string } | undefined)?.chainId
              : undefined;
            if (!requested) return null;
            chainId = Number.parseInt(requested, 16);
            scope.__walletChainId = chainId;
            for (const listener of listeners.chainChanged ?? []) {
              listener(`0x${chainId.toString(16)}`);
            }
            return null;
          }
          default:
            return null;
        }
      },
      on(event: string, listener: Handler) {
        listeners[event] = [...(listeners[event] ?? []), listener];
      },
      removeListener(event: string, listener: Handler) {
        listeners[event] = (listeners[event] ?? []).filter((each) => each !== listener);
      },
    };

    const info = { uuid: "mock-wallet", name: "Mock Wallet", icon: "", rdns: cfg.rdns };
    const announce = () => {
      window.dispatchEvent(
        new CustomEvent("eip6963:announceProvider", { detail: { info, provider } }),
      );
    };
    // Announce once at load and again whenever the app asks (EIP-6963 request).
    window.addEventListener("eip6963:requestProvider", announce);
    announce();
    (window as unknown as { __mockWalletInstalled: boolean }).__mockWalletInstalled = true;
  }, config);
}
