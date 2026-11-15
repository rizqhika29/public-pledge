"use client";

import { useState, type ReactNode } from "react";
import { Info, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui";
import { useWallet } from "@/lib/genlayer/WalletProvider";
import { describeError } from "@/lib/errors";
import { notifyError } from "@/lib/notify";
import { FAUCET, HAS_CONTRACT, NETWORK_KEY, NETWORK_LABEL } from "@/lib/config";

/** Shown under the navbar when the wallet is connected to the wrong network. Never opens a prompt by itself. */
export function NetworkBanner() {
  const w = useWallet();
  const [busy, setBusy] = useState(false);

  if (w.status !== "connected" || w.isCorrectNetwork) return null;

  async function onSwitch() {
    setBusy(true);
    try {
      await w.switchNetwork();
    } catch (error) {
      notifyError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-2.5 text-sm text-amber-100 sm:px-6">
        <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
        <span className="flex-1">Your wallet is on a different network. Switch to {NETWORK_LABEL[NETWORK_KEY]} to send transactions.</span>
        <Button size="sm" variant="secondary" onClick={onSwitch} loading={busy}>
          Switch network
        </Button>
      </div>
    </div>
  );
}

/** Shown on app pages when no contract address was configured at build time. */
export function ConfigNotice() {
  if (HAS_CONTRACT) return null;
  return (
    <div className="flex gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
      <Info className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <div>
        <p className="font-medium">No contract is configured yet.</p>
        <p className="mt-1 text-amber-100/80">
          Deploy <code className="rounded bg-black/30 px-1">contracts/public_pledge.py</code> to {NETWORK_LABEL[NETWORK_KEY]}, then set{" "}
          <code className="rounded bg-black/30 px-1">NEXT_PUBLIC_CONTRACT_ADDRESS</code> in <code className="rounded bg-black/30 px-1">frontend/.env.local</code> and
          restart the app. Need test GEN? Use the{" "}
          <a className="underline underline-offset-2" href={FAUCET[NETWORK_KEY].url} target="_blank" rel="noopener noreferrer">
            {FAUCET[NETWORK_KEY].label}
          </a>
          .
        </p>
      </div>
    </div>
  );
}

export function ErrorPanel({ error, onRetry, retrying }: { error: unknown; onRetry?: () => void; retrying?: boolean }) {
  const described = describeError(error);
  return (
    <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5" role="alert">
      <p className="font-medium text-rose-100">{described.title}</p>
      <p className="mt-1 text-sm text-rose-100/80">{described.message}</p>
      {onRetry && (
        <Button className="mt-4" size="sm" variant="secondary" onClick={onRetry} loading={retrying}>
          <RefreshCw className="h-4 w-4" aria-hidden />
          Try again
        </Button>
      )}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-zinc-400">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}
