"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CHAIN_ID, CHAIN_ID_HEX, walletChainParams } from "@/lib/genlayer/chain";
import {
  legacyInjectedWallet,
  subscribeWallets,
  type DiscoveredWallet,
  type Eip1193Provider,
  type Signer,
} from "@/lib/genlayer/wallets";
import { NETWORK_KEY, NETWORK_LABEL } from "@/lib/config";
import { NotConnectedError, WalletBusyError, WrongNetworkError } from "@/lib/errors";

const LS_WALLET = "pp.wallet";
const LS_OFF = "pp.wallet.off";

export type WalletStatus = "initializing" | "disconnected" | "connecting" | "connected";

interface Session {
  wallet: DiscoveredWallet;
  address: string;
  chainId: number | null;
}

interface WalletContextValue {
  status: WalletStatus;
  wallets: DiscoveredWallet[];
  activeWallet: DiscoveredWallet | null;
  address: string | null;
  chainId: number | null;
  isCorrectNetwork: boolean;
  /** True while a wallet prompt that we opened is waiting for the user. */
  isBusy: boolean;
  modalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  connect: (wallet: DiscoveredWallet) => Promise<void>;
  disconnect: () => void;
  switchNetwork: () => Promise<void>;
  /** Verifies a wallet is connected and on the right network, and returns what's needed to sign. */
  getSigner: () => Promise<Signer>;
}

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

function parseChainId(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const n = value.startsWith("0x") ? parseInt(value, 16) : parseInt(value, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

async function readChainId(provider: Eip1193Provider): Promise<number | null> {
  try {
    return parseChainId(await provider.request({ method: "eth_chainId" }));
  } catch {
    return null;
  }
}

function errorCode(error: unknown): number | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "number" ? code : undefined;
}

function isUnknownChain(error: unknown): boolean {
  if (errorCode(error) === 4902) return true;
  const message = String((error as { message?: unknown } | null)?.message ?? "").toLowerCase();
  return message.includes("unrecognized chain") || message.includes("not been added");
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallets, setWallets] = useState<DiscoveredWallet[]>([]);
  const [discovered, setDiscovered] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const busyRef = useRef(false);
  const restoredRef = useRef(false);
  const sessionRef = useRef<Session | null>(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  /**
   * Single-flight guard: only one wallet prompt (connect / switch network) can be
   * open at a time. A second click throws instead of stacking another pop-up.
   */
  const exclusive = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    if (busyRef.current) throw new WalletBusyError();
    busyRef.current = true;
    setBusy(true);
    try {
      return await fn();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  // Discover wallets announced through EIP-6963 (with a legacy fallback).
  useEffect(() => {
    const unsubscribe = subscribeWallets((wallet) => {
      setWallets((prev) => (prev.some((p) => p.info.rdns === wallet.info.rdns) ? prev : [...prev, wallet]));
    });
    const timer = window.setTimeout(() => {
      setWallets((prev) => {
        if (prev.length > 0) return prev;
        const legacy = legacyInjectedWallet();
        return legacy ? [legacy] : prev;
      });
      setDiscovered(true);
    }, 400);
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);

  // Silently restore the previous session. eth_accounts never opens a pop-up, and
  // only the wallet the user chose last time is asked.
  useEffect(() => {
    if (restoredRef.current) return;

    let savedRdns: string | null = null;
    let disconnectedByUser = false;
    try {
      savedRdns = localStorage.getItem(LS_WALLET);
      disconnectedByUser = localStorage.getItem(LS_OFF) === "1";
    } catch {
      // storage unavailable
    }

    const wallet = savedRdns && !disconnectedByUser ? wallets.find((w) => w.info.rdns === savedRdns) : undefined;

    if (wallet) {
      restoredRef.current = true;
      void (async () => {
        try {
          const accounts = (await wallet.provider.request({ method: "eth_accounts" })) as unknown;
          const list = Array.isArray(accounts) ? (accounts as string[]) : [];
          if (list.length > 0) {
            const chainId = await readChainId(wallet.provider);
            setSession({ wallet, address: list[0], chainId });
          }
        } catch {
          // stay disconnected
        } finally {
          setInitializing(false);
        }
      })();
      return;
    }

    if (discovered) {
      restoredRef.current = true;
      setInitializing(false);
    }
  }, [wallets, discovered]);

  // React to account / network changes on the active wallet only.
  const activeProvider = session?.wallet.provider;
  useEffect(() => {
    if (!activeProvider?.on) return;

    const onAccounts = (...args: unknown[]) => {
      const accounts = Array.isArray(args[0]) ? (args[0] as string[]) : [];
      setSession((current) => {
        if (!current) return current;
        if (accounts.length === 0) return null;
        return { ...current, address: accounts[0] };
      });
    };
    const onChain = (...args: unknown[]) => {
      const chainId = parseChainId(args[0]);
      setSession((current) => (current ? { ...current, chainId } : current));
    };

    activeProvider.on("accountsChanged", onAccounts);
    activeProvider.on("chainChanged", onChain);
    return () => {
      activeProvider.removeListener?.("accountsChanged", onAccounts);
      activeProvider.removeListener?.("chainChanged", onChain);
    };
  }, [activeProvider]);

  const connect = useCallback(
    async (wallet: DiscoveredWallet) => {
      await exclusive(async () => {
        setConnecting(true);
        try {
          const accounts = (await wallet.provider.request({ method: "eth_requestAccounts" })) as unknown;
          const list = Array.isArray(accounts) ? (accounts as string[]) : [];
          if (list.length === 0) throw new Error("The wallet did not share any account.");
          const chainId = await readChainId(wallet.provider);
          setSession({ wallet, address: list[0], chainId });
          try {
            localStorage.setItem(LS_WALLET, wallet.info.rdns);
            localStorage.removeItem(LS_OFF);
          } catch {
            // storage unavailable
          }
          setModalOpen(false);
        } finally {
          setConnecting(false);
        }
      });
    },
    [exclusive],
  );

  const disconnect = useCallback(() => {
    try {
      localStorage.setItem(LS_OFF, "1");
    } catch {
      // storage unavailable
    }
    setSession(null);
  }, []);

  const switchNetwork = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) throw new NotConnectedError();
    const provider = current.wallet.provider;

    await exclusive(async () => {
      try {
        await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_ID_HEX }] });
      } catch (error) {
        if (!isUnknownChain(error)) throw error;
        await provider.request({ method: "wallet_addEthereumChain", params: [walletChainParams()] });
      }
      const chainId = await readChainId(provider);
      setSession((s) => (s ? { ...s, chainId } : s));
    });
  }, [exclusive]);

  const getSigner = useCallback(async (): Promise<Signer> => {
    const current = sessionRef.current;
    if (!current) throw new NotConnectedError();
    // Re-read the chain instead of trusting cached state: the user may have switched it in the wallet.
    const chainId = await readChainId(current.wallet.provider);
    if (chainId !== CHAIN_ID) {
      setSession((s) => (s ? { ...s, chainId } : s));
      throw new WrongNetworkError(NETWORK_LABEL[NETWORK_KEY]);
    }
    return { address: current.address, provider: current.wallet.provider };
  }, []);

  const status: WalletStatus = initializing ? "initializing" : connecting ? "connecting" : session ? "connected" : "disconnected";

  const value = useMemo<WalletContextValue>(
    () => ({
      status,
      wallets,
      activeWallet: session?.wallet ?? null,
      address: session?.address ?? null,
      chainId: session?.chainId ?? null,
      isCorrectNetwork: session?.chainId === CHAIN_ID,
      isBusy: busy,
      modalOpen,
      openModal: () => setModalOpen(true),
      closeModal: () => setModalOpen(false),
      connect,
      disconnect,
      switchNetwork,
      getSigner,
    }),
    [status, wallets, session, busy, modalOpen, connect, disconnect, switchNetwork, getSigner],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used inside <WalletProvider>");
  return context;
}
