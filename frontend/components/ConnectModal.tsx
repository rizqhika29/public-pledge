"use client";

import { Wallet } from "lucide-react";
import { Modal, Spinner } from "@/components/ui";
import { useWallet } from "@/lib/genlayer/WalletProvider";
import type { DiscoveredWallet } from "@/lib/genlayer/wallets";
import { notifyError } from "@/lib/notify";
import { NETWORK_KEY, NETWORK_LABEL } from "@/lib/config";

export function ConnectModal() {
  const w = useWallet();
  const connecting = w.status === "connecting";

  async function pick(wallet: DiscoveredWallet) {
    try {
      await w.connect(wallet);
    } catch (error) {
      notifyError(error);
    }
  }

  return (
    <Modal open={w.modalOpen} onClose={w.closeModal} title="Connect a wallet" dismissible={!connecting}>
      {w.wallets.length === 0 ? (
        <div className="space-y-3 text-sm text-zinc-300">
          <p>No browser wallet was detected.</p>
          <p className="text-zinc-400">
            Install an EVM wallet such as{" "}
            <a className="text-brand-300 underline underline-offset-2" href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer">
              MetaMask
            </a>
            , reload this page, and try again.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-zinc-400">
            Choose the wallet to use. Only the one you pick is contacted, so other extensions will not open their own pop-ups.
          </p>
          <ul className="space-y-2">
            {w.wallets.map((wallet) => (
              <li key={wallet.info.rdns}>
                <button
                  onClick={() => pick(wallet)}
                  disabled={connecting || w.isBusy}
                  className="flex w-full items-center gap-3 rounded-xl border border-ink-600 bg-ink-800 px-4 py-3 text-left transition-colors hover:border-brand-500 disabled:opacity-60"
                >
                  {wallet.info.icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={wallet.info.icon} alt="" className="h-8 w-8 rounded-md" />
                  ) : (
                    <Wallet className="h-8 w-8 text-brand-400" aria-hidden />
                  )}
                  <span className="flex-1 text-sm font-medium text-white">{wallet.info.name}</span>
                  {connecting && <Spinner className="h-4 w-4" />}
                </button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-zinc-500">
            After connecting you may be asked once to add or switch to {NETWORK_LABEL[NETWORK_KEY]}. Only that single prompt appears.
          </p>
        </div>
      )}
    </Modal>
  );
}
