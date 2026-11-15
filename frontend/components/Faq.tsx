import type { ReactNode } from "react";

export const FAQ: ReadonlyArray<{ q: string; a: ReactNode }> = [
  {
    q: "Who decides whether I kept my promise?",
    a: "A committee of GenLayer validators. Each one independently reads the evidence page you named and asks its own AI model whether your criteria were met. They must agree on the verdict, so no single person, model, or operator decides.",
  },
  {
    q: "What if the evidence page is down or unclear?",
    a: "The result is 'inconclusive'. Nothing is settled and the pledge stays open, so it can be judged again once the page is fixed. If it is still unresolved a week after the deadline, the owner can take the stake back with no verdict and no mark on their record.",
  },
  {
    q: "Where does the money go?",
    a: "If the promise is kept, the stake becomes claimable by the owner. If it is broken, it becomes claimable by the beneficiary the owner chose when creating the pledge. Settled money waits in a claimable balance until the recipient withdraws it.",
  },
  {
    q: "Can I cheat by writing a friendly page or clever criteria?",
    a: "You control your own wording and evidence link, so choose a third-party source (a GitHub release, a fitness app page, an official notice). Validators are told to treat page content as untrusted and to answer 'inconclusive' when in doubt, but no prompt is bulletproof. The strongest guarantee is the public record, not a perfect AI.",
  },
  {
    q: "Is this a legal judgement?",
    a: "No. It is an evidence-based commitment mechanism. It does not replace a contract, a court, or professional advice.",
  },
  {
    q: "Why do transactions take a while?",
    a: "Validators have to fetch the page and run an AI model, then vote. A judgement usually takes longer than an ordinary blockchain transaction.",
  },
];

export function Faq({ items = FAQ }: { items?: typeof FAQ }) {
  return (
    <div className="divide-y divide-ink-700 rounded-2xl border border-ink-700 bg-ink-900/60">
      {items.map((item) => (
        <details key={item.q} className="group px-5 py-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-white marker:content-none">
            {item.q}
            <span className="text-brand-400 transition-transform group-open:rotate-45" aria-hidden>
              +
            </span>
          </summary>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">{item.a}</p>
        </details>
      ))}
    </div>
  );
}
