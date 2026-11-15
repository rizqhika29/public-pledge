"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, ShieldCheck, X } from "lucide-react";
import { WalletButton } from "@/components/WalletButton";
import { buttonClass } from "@/components/ui";
import { APP_NAME, NETWORK_KEY, NETWORK_LABEL } from "@/lib/config";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/pledges", label: "Pledges" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/account", label: "My account" },
] as const;

export function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-30 border-b border-ink-700/70 bg-ink-950/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold text-white" onClick={() => setOpen(false)}>
          <ShieldCheck className="h-6 w-6 text-brand-400" aria-hidden />
          {APP_NAME}
        </Link>

        <nav className="ml-6 hidden items-center gap-1 md:flex" aria-label="Main">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-lg px-3 py-2 text-sm transition-colors",
                isActive(link.href) ? "bg-ink-800 text-white" : "text-zinc-400 hover:text-white",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden rounded-full border border-ink-600 px-2.5 py-1 text-xs text-zinc-400 sm:inline-block" title="Network this app talks to">
            {NETWORK_LABEL[NETWORK_KEY]}
          </span>
          <Link href="/create" className={buttonClass("primary", "md", "hidden sm:inline-flex")}>
            New pledge
          </Link>
          <WalletButton />
          <button
            className="rounded-lg p-2 text-zinc-300 hover:bg-ink-800 md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-ink-700 bg-ink-950 px-4 py-3 md:hidden" aria-label="Mobile">
          <ul className="space-y-1">
            {[{ href: "/create", label: "New pledge" }, ...LINKS].map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "block rounded-lg px-3 py-2 text-sm",
                    isActive(link.href) ? "bg-ink-800 text-white" : "text-zinc-300 hover:bg-ink-800",
                  )}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
