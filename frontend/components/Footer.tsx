import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { APP_NAME, DOCS_URL, FAUCET, NETWORK_KEY, NETWORK_LABEL } from "@/lib/config";

export function Footer() {
  const faucet = FAUCET[NETWORK_KEY];
  return (
    <footer className="mt-20 border-t border-ink-700 bg-ink-950">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-3">
        <div>
          <div className="flex items-center gap-2 font-semibold text-white">
            <ShieldCheck className="h-5 w-5 text-brand-400" aria-hidden />
            {APP_NAME}
          </div>
          <p className="mt-3 max-w-xs text-sm text-zinc-400">
            Promises with stakes, judged by GenLayer&apos;s AI validators. No operator decides the outcome.
          </p>
        </div>

        <nav aria-label="Footer" className="grid grid-cols-2 gap-6 text-sm">
          <ul className="space-y-2">
            <li className="font-medium text-white">App</li>
            <li>
              <Link className="text-zinc-400 hover:text-white" href="/pledges">
                Browse pledges
              </Link>
            </li>
            <li>
              <Link className="text-zinc-400 hover:text-white" href="/create">
                Make a pledge
              </Link>
            </li>
            <li>
              <Link className="text-zinc-400 hover:text-white" href="/account">
                My account
              </Link>
            </li>
          </ul>
          <ul className="space-y-2">
            <li className="font-medium text-white">Learn</li>
            <li>
              <Link className="text-zinc-400 hover:text-white" href="/how-it-works">
                How it works
              </Link>
            </li>
            <li>
              <a className="text-zinc-400 hover:text-white" href={DOCS_URL} target="_blank" rel="noopener noreferrer">
                GenLayer docs
              </a>
            </li>
            <li>
              <a className="text-zinc-400 hover:text-white" href={faucet.url} target="_blank" rel="noopener noreferrer">
                {faucet.label}
              </a>
            </li>
          </ul>
        </nav>

        <div className="text-sm text-zinc-500">
          <p>
            Running on <span className="text-zinc-300">{NETWORK_LABEL[NETWORK_KEY]}</span>. Use test GEN only.
          </p>
          <p className="mt-3">
            Pledges are evidence-based commitments, not legal judgements. An AI verdict does not replace a contract, a court, or professional advice.
          </p>
        </div>
      </div>
    </footer>
  );
}
