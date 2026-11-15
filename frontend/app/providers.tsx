"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { WalletProvider } from "@/lib/genlayer/WalletProvider";
import { TxProvider } from "@/components/TxProvider";
import { ConnectModal } from "@/components/ConnectModal";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, staleTime: 10_000, refetchOnWindowFocus: false } },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <WalletProvider>
        <TxProvider>
          {children}
          <ConnectModal />
        </TxProvider>
        <Toaster theme="dark" position="top-right" richColors closeButton />
      </WalletProvider>
    </QueryClientProvider>
  );
}
