"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Copy, LogOut, Repeat, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button, Skeleton } from "@/components/ui";
import { useTx } from "@/components/TxProvider";
import { useWallet } from "@/lib/genlayer/WalletProvider";
import { notifyError } from "@/lib/notify";
import { NETWORK_KEY, NETWORK_LABEL } from "@/lib/config";
import { shortAddress } from "@/lib/utils";

export function WalletButton() {
  const w = useWallet();
  const tx = useTx();
  const [menuOpen, setMenuOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  if (w.status === "initializing") return <Skeleton className="h-10 w-36" />;

  if (w.status === "disconnected" || w.status === "connecting" || !w.address) {
    return (
      <Button onClick={w.openModal} loading={w.status === "connecting"} disabled={tx.active}>
        Connect wallet
      </Button>
    );
  }

  async function switchNetwork() {
    setSwitching(true);
    try {
      await w.switchNetwork();
    } catch (error) {
      notifyError(error);
    } finally {
      setSwitching(false);
    }
  }

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(w.address ?? "");
      toast.success("Address copied");
    } catch {
      toast.error("Could not copy the address");
    }
    setMenuOpen(false);
  }

  if (!w.isCorrectNetwork) {
    return (
      <Button variant="secondary" onClick={switchNetwork} loading={switching} disabled={tx.active} className="border-amber-500/60 text-amber-200">
        <TriangleAlert className="h-4 w-4" aria-hidden />
        Switch to {NETWORK_LABEL[NETWORK_KEY]}
      </Button>
    );
  }

  return (
    <div className="relative" ref={rootRef}>
      <Button variant="secondary" onClick={() => setMenuOpen((v) => !v)} aria-haspopup="menu" aria-expanded={menuOpen}>
        {w.activeWallet?.info.icon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={w.activeWallet.info.icon} alt="" className="h-5 w-5 rounded" />
        ) : (
          <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
        )}
        <span className="font-mono">{shortAddress(w.address)}</span>
        <ChevronDown className="h-4 w-4 text-zinc-400" aria-hidden />
      </Button>
      {menuOpen && (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-xl border border-ink-600 bg-ink-900 py-1 shadow-xl">
          <div className="border-b border-ink-700 px-3 py-2 text-xs text-zinc-400">
            Connected with {w.activeWallet?.info.name ?? "wallet"}
          </div>
          <MenuItem icon={<Copy className="h-4 w-4" />} onClick={copyAddress}>
            Copy address
          </MenuItem>
          <MenuItem
            icon={<Repeat className="h-4 w-4" />}
            onClick={() => {
              setMenuOpen(false);
              w.openModal();
            }}
            disabled={tx.active}
          >
            Use another wallet
          </MenuItem>
          <MenuItem
            icon={<LogOut className="h-4 w-4" />}
            onClick={() => {
              setMenuOpen(false);
              w.disconnect();
            }}
            disabled={tx.active}
          >
            Disconnect
          </MenuItem>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  onClick,
  disabled,
  children,
}: {
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-ink-800 disabled:opacity-50"
    >
      <span className="text-zinc-400">{icon}</span>
      {children}
    </button>
  );
}
