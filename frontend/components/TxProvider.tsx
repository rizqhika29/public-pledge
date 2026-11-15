"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Circle, CircleCheck, CircleX, Loader2 } from "lucide-react";
import { Button, Modal, buttonClass } from "@/components/ui";
import { useWallet } from "@/lib/genlayer/WalletProvider";
import { submitWrite } from "@/lib/tx";
import { TxFailedError, WalletBusyError, describeError, type UserFacingError } from "@/lib/errors";
import { notifyError } from "@/lib/notify";
import { cn, shortAddress } from "@/lib/utils";
import { NETWORK_KEY, NETWORK_LABEL } from "@/lib/config";

export interface TxResult {
  headline?: string;
  detail?: string;
  tone?: "good" | "bad" | "neutral";
  href?: string;
  hrefLabel?: string;
}

export interface RunOptions {
  title: string;
  functionName: string;
  args: Array<string | bigint>;
  /** GEN (in wei) sent along with a payable method. */
  value?: bigint;
  /** Shown while validators work. */
  consensusHint?: string;
  successTitle: string;
  /** Runs after consensus; may read fresh contract state and return something to show the user. */
  afterSuccess?: () => Promise<TxResult | void>;
}

type TxStatus = "idle" | "wallet" | "consensus" | "success" | "error";

interface TxState {
  status: TxStatus;
  title: string;
  hint: string;
  successTitle: string;
  hash: string | null;
  error: UserFacingError | null;
  result: TxResult | null;
}

const IDLE: TxState = { status: "idle", title: "", hint: "", successTitle: "", hash: null, error: null, result: null };

interface TxContextValue {
  /** True while a transaction is waiting for the wallet or for validators. */
  active: boolean;
  /** Resolves true on success. Only one transaction can run at a time. */
  run: (options: RunOptions) => Promise<boolean>;
}

const TxContext = createContext<TxContextValue | undefined>(undefined);

export function useTx(): TxContextValue {
  const ctx = useContext(TxContext);
  if (!ctx) throw new Error("useTx must be used inside <TxProvider>");
  return ctx;
}

export function TxProvider({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  const queryClient = useQueryClient();

  const [state, setState] = useState<TxState>(IDLE);
  const [open, setOpen] = useState(false);

  const walletRef = useRef(wallet);
  const activeRef = useRef(false);
  const openRef = useRef(false);

  useEffect(() => {
    walletRef.current = wallet;
  }, [wallet]);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const active = state.status === "wallet" || state.status === "consensus";

  const run = useCallback(
    async (options: RunOptions): Promise<boolean> => {
      // Single flight: a second click can never stack another wallet pop-up.
      if (activeRef.current || walletRef.current.isBusy) {
        notifyError(new WalletBusyError());
        return false;
      }
      activeRef.current = true;
      setState({ ...IDLE, status: "wallet", title: options.title, hint: options.consensusHint ?? "", successTitle: options.successTitle });
      setOpen(true);

      try {
        const signer = await walletRef.current.getSigner();
        const { hash } = await submitWrite({
          signer,
          functionName: options.functionName,
          args: options.args,
          value: options.value,
          ctl: {
            setPhase: (phase) => setState((s) => ({ ...s, status: phase })),
            setHash: (h) => setState((s) => ({ ...s, hash: h })),
          },
        });

        void queryClient.invalidateQueries();

        let result: TxResult | null = null;
        if (options.afterSuccess) {
          try {
            result = (await options.afterSuccess()) ?? null;
          } catch {
            result = null; // the write itself succeeded; the extra read is optional
          }
        }
        setState((s) => ({ ...s, status: "success", hash, result }));
        if (!openRef.current) toast.success(options.successTitle, { description: result?.headline });
        return true;
      } catch (error) {
        const described = describeError(error);
        if (described.kind === "rejected") {
          setOpen(false);
          setState(IDLE);
          notifyError(error);
          return false;
        }
        const hash = error instanceof TxFailedError ? (error.hash ?? null) : null;
        setState((s) => ({ ...s, status: "error", error: described, hash: hash ?? s.hash }));
        if (!openRef.current) toast.error(described.title, { description: described.message });
        return false;
      } finally {
        activeRef.current = false;
      }
    },
    [queryClient],
  );

  const close = useCallback(() => {
    setOpen(false);
    setState((s) => (s.status === "success" || s.status === "error" ? IDLE : s));
  }, []);

  const value = useMemo<TxContextValue>(() => ({ active, run }), [active, run]);

  return (
    <TxContext.Provider value={value}>
      {children}
      <TxDialog open={open} state={state} onClose={close} />
      {!open && active && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full border border-brand-500/50 bg-ink-900 px-4 py-2 text-sm text-white shadow-lg hover:bg-ink-800"
        >
          <Loader2 className="h-4 w-4 animate-spin text-brand-400" aria-hidden />
          Transaction in progress · View
        </button>
      )}
    </TxContext.Provider>
  );
}

type StepState = "todo" | "active" | "done" | "failed";

function Step({ state, label, detail }: { state: StepState; label: string; detail?: string }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 shrink-0">
        {state === "done" && <CircleCheck className="h-5 w-5 text-emerald-400" aria-hidden />}
        {state === "active" && <Loader2 className="h-5 w-5 animate-spin text-brand-400" aria-hidden />}
        {state === "failed" && <CircleX className="h-5 w-5 text-rose-400" aria-hidden />}
        {state === "todo" && <Circle className="h-5 w-5 text-ink-500" aria-hidden />}
      </span>
      <span>
        <span className={cn("block text-sm font-medium", state === "todo" ? "text-zinc-500" : "text-white")}>{label}</span>
        {detail && state === "active" && <span className="mt-0.5 block text-xs text-zinc-400">{detail}</span>}
      </span>
    </li>
  );
}

function TxDialog({ open, state, onClose }: { open: boolean; state: TxState; onClose: () => void }) {
  const wallet = useWallet();
  const [switching, setSwitching] = useState(false);

  if (!open || state.status === "idle") return null;

  const { status } = state;
  const walletStep: StepState = status === "wallet" ? "active" : status === "error" && !state.hash ? "failed" : "done";
  const consensusStep: StepState =
    status === "wallet" ? "todo" : status === "consensus" ? "active" : status === "success" ? "done" : state.hash ? "failed" : "todo";

  async function switchNetwork() {
    setSwitching(true);
    try {
      await wallet.switchNetwork();
      onClose();
    } catch (error) {
      notifyError(error);
    } finally {
      setSwitching(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={state.title}>
      {status === "success" ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <CircleCheck className="mt-0.5 h-6 w-6 shrink-0 text-emerald-400" aria-hidden />
            <div>
              <p className="font-medium text-white">{state.successTitle}</p>
              {state.result?.headline && (
                <p
                  className={cn(
                    "mt-1 text-sm font-semibold",
                    state.result.tone === "bad" ? "text-rose-300" : state.result.tone === "neutral" ? "text-amber-300" : "text-emerald-300",
                  )}
                >
                  {state.result.headline}
                </p>
              )}
              {state.result?.detail && <p className="mt-1 text-sm text-zinc-300">{state.result.detail}</p>}
            </div>
          </div>
          {state.hash && <HashLine hash={state.hash} />}
          <div className="flex justify-end gap-2">
            {state.result?.href && (
              <Link href={state.result.href} onClick={onClose} className={buttonClass("primary", "md")}>
                {state.result.hrefLabel ?? "Continue"}
              </Link>
            )}
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      ) : status === "error" && state.error ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <CircleX className="mt-0.5 h-6 w-6 shrink-0 text-rose-400" aria-hidden />
            <div>
              <p className="font-medium text-white">{state.error.title}</p>
              <p className="mt-1 text-sm text-zinc-300">{state.error.message}</p>
            </div>
          </div>
          {state.hash && <HashLine hash={state.hash} />}
          <div className="flex justify-end gap-2">
            {state.error.kind === "network" && wallet.status === "connected" && !wallet.isCorrectNetwork && (
              <Button onClick={switchNetwork} loading={switching}>
                Switch to {NETWORK_LABEL[NETWORK_KEY]}
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <ol className="space-y-4">
            <Step
              state={walletStep}
              label="Confirm in your wallet"
              detail={`Approve the request in ${wallet.activeWallet?.info.name ?? "your wallet"}. You will be asked once.`}
            />
            <Step state={consensusStep} label="Validators reach consensus" detail={state.hint || "This can take a minute or more."} />
          </ol>
          {state.hash && <HashLine hash={state.hash} />}
          <p className="text-xs text-zinc-500">
            {status === "consensus"
              ? "Your transaction is submitted. You can close this window; it keeps running and we will notify you."
              : "Nothing is sent until you approve in your wallet."}
          </p>
        </div>
      )}
    </Modal>
  );
}

function HashLine({ hash }: { hash: string }) {
  return (
    <p className="rounded-lg bg-ink-950 px-3 py-2 font-mono text-xs text-zinc-400" title={hash}>
      Tx {shortAddress(hash, 10, 8)}
    </p>
  );
}
