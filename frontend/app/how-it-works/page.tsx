import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, CircleHelp, CircleX } from "lucide-react";
import { Card } from "@/components/ui";
import { Faq } from "@/components/Faq";
import { buttonClass } from "@/lib/styles";

export const metadata: Metadata = {
  title: "How it works",
  description: "How a Public Pledge is created, judged by GenLayer validators, and settled.",
};

const LIFECYCLE = [
  {
    title: "1. Create",
    body: "You send a promise, the criteria, an https evidence link, a beneficiary, a deadline, and the stake in one transaction. The contract checks the inputs and locks the stake. The pledge starts as Open.",
  },
  {
    title: "2. Wait for the deadline",
    body: "Nothing can be judged before the deadline. Until then the pledge is simply Open and visible to everyone.",
  },
  {
    title: "3. Judgement",
    body: "After the deadline, anyone can ask the validators to judge. The caller only triggers it; the result is decided by consensus, not by the caller.",
  },
  {
    title: "4. Settlement and withdrawal",
    body: "A conclusive verdict moves the stake into the winner's claimable balance. They then withdraw it to their wallet from the Account page.",
  },
] as const;

const VERDICTS = [
  {
    icon: CircleCheck,
    tone: "text-emerald-300",
    title: "Kept",
    body: "The evidence clearly shows the promise was fulfilled by the deadline. The owner can take the stake back and their record gains a kept pledge.",
  },
  {
    icon: CircleX,
    tone: "text-rose-300",
    title: "Broken",
    body: "The evidence clearly shows it was not fulfilled, or it happened after the deadline. The beneficiary can claim the stake and the owner's record gains a broken pledge.",
  },
  {
    icon: CircleHelp,
    tone: "text-amber-300",
    title: "Inconclusive",
    body: "The evidence is missing, unrelated, or unclear. Nothing is settled and the pledge stays open, so it can be judged again after the page is fixed.",
  },
] as const;

const TIPS = [
  "Pick a source you do not control, such as a GitHub release, an official announcement, or an activity page.",
  "Write criteria a stranger could check from that page alone. Include the date or number that decides it.",
  "Choose evidence that will not change after the deadline. Counters and live statuses make validators disagree.",
  "Keep the promise specific. 'Publish release v1.0 tagged v1.0' is better than 'make progress on the project'.",
  "Leave time before the deadline. Judgement is only possible after it, so the evidence must exist by then.",
] as const;

export default function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">How it works</h1>
      <p className="mt-3 max-w-2xl text-zinc-400">
        A pledge is a stake on a promise. This page explains what happens at each stage, how the validators decide, and how to write a pledge that is easy to judge fairly.
      </p>

      <section className="mt-12" aria-labelledby="lifecycle">
        <h2 id="lifecycle" className="text-xl font-semibold text-white">
          The life of a pledge
        </h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {LIFECYCLE.map((step) => (
            <Card key={step.title} className="p-5">
              <h3 className="font-semibold text-white">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{step.body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-14" aria-labelledby="consensus">
        <h2 id="consensus" className="text-xl font-semibold text-white">
          How the validators decide
        </h2>
        <div className="mt-4 space-y-4 text-sm leading-relaxed text-zinc-300">
          <p>
            When judgement is requested, GenLayer picks a committee of validators. One of them, the <strong className="text-white">leader</strong>, fetches your
            evidence page and asks its AI model for a verdict: kept, broken, or inconclusive, with a one-sentence reason.
          </p>
          <p>
            The other validators do not trust the leader. Each one <strong className="text-white">independently fetches the same page and asks its own AI</strong>.
            The leader&apos;s proposal is only accepted if the majority reach the same verdict. The wording of the reason may differ; the verdict may not.
          </p>
          <p>
            If the majority disagree, a new leader is chosen and the process repeats. If consensus still cannot be reached, the transaction ends as undetermined and
            nothing changes, so your stake stays where it was.
          </p>
          <p className="rounded-xl border border-ink-700 bg-ink-900 p-4 text-zinc-400">
            After validators accept a decision there is a short appeal window before it becomes final. This app shows the latest accepted result as soon as it
            exists, and that result can still be challenged until it is finalized.
          </p>
        </div>
      </section>

      <section className="mt-14" aria-labelledby="verdicts">
        <h2 id="verdicts" className="text-xl font-semibold text-white">
          The three outcomes
        </h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {VERDICTS.map((verdict) => (
            <Card key={verdict.title} className="p-5">
              <div className={`flex items-center gap-2 font-semibold ${verdict.tone}`}>
                <verdict.icon className="h-5 w-5" aria-hidden />
                {verdict.title}
              </div>
              <p className="mt-3 text-sm leading-relaxed text-zinc-400">{verdict.body}</p>
            </Card>
          ))}
        </div>
        <p className="mt-4 text-sm text-zinc-400">
          If a pledge is still unresolved seven days after its deadline, the owner can take the stake back. That is recorded as a refund, with no verdict and no
          change to anyone&apos;s record.
        </p>
      </section>

      <section className="mt-14" aria-labelledby="tips">
        <h2 id="tips" className="text-xl font-semibold text-white">
          Writing a pledge that is easy to judge
        </h2>
        <ul className="mt-5 space-y-3">
          {TIPS.map((tip) => (
            <li key={tip} className="flex gap-3 text-sm text-zinc-300">
              <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-300" aria-hidden />
              {tip}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-14" aria-labelledby="limits">
        <h2 id="limits" className="text-xl font-semibold text-white">
          Limits you should know about
        </h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-zinc-400">
          <li>The owner writes the promise, the criteria, and the evidence link. A determined cheater can try to game wording or point to a page they control.</li>
          <li>The beneficiary does not agree to anything. Treat them as a recipient the owner chose, not as a counterparty who was wronged.</li>
          <li>Anyone can request judgement right after the deadline. If your proof only appears later, the pledge may be judged broken first.</li>
          <li>This is a technical commitment mechanism. It is not a legal judgement and does not replace a contract or a court.</li>
        </ul>
      </section>

      <section className="mt-14" aria-labelledby="faq">
        <h2 id="faq" className="mb-5 text-xl font-semibold text-white">
          Questions
        </h2>
        <Faq />
      </section>

      <div className="mt-12 flex flex-wrap gap-3">
        <Link href="/create" className={buttonClass("primary", "lg")}>
          Make a pledge
        </Link>
        <Link href="/pledges" className={buttonClass("secondary", "lg")}>
          Browse pledges
        </Link>
      </div>
    </div>
  );
}
