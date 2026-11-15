import Link from "next/link";
import {
  ArrowRight,
  Coins,
  Dumbbell,
  Eye,
  FileText,
  Gavel,
  Link2,
  Lock,
  Rocket,
  Scale,
  ShieldCheck,
  Target,
  Users,
} from "lucide-react";
import { Card } from "@/components/ui";
import { Faq } from "@/components/Faq";
import { LiveStats } from "@/components/LiveStats";
import { ConfigNotice } from "@/components/feedback";
import { buttonClass } from "@/lib/styles";
import { NETWORK_KEY, NETWORK_LABEL } from "@/lib/config";

const STEPS = [
  {
    icon: FileText,
    title: "Write the promise",
    body: "Say what you will do in plain language, and how it should be checked. Name the public page that will prove it.",
  },
  {
    icon: Lock,
    title: "Lock a stake",
    body: "Put GEN behind the promise and pick a beneficiary who receives it if you fail. Your stake stays in the contract until the verdict.",
  },
  {
    icon: Eye,
    title: "Validators read the evidence",
    body: "After the deadline, GenLayer validators each fetch your evidence page and ask their own AI whether the promise was kept.",
  },
  {
    icon: Gavel,
    title: "Consensus settles it",
    body: "They must agree on the verdict. Kept: you can take your stake back. Broken: the beneficiary can claim it.",
  },
] as const;

const USE_CASES = [
  { icon: Rocket, title: "Ship it", body: "Commit to a release, a launch, or a published article by a date, with a GitHub release or live page as proof." },
  { icon: Dumbbell, title: "Build the habit", body: "Back a training or learning goal with money and a public activity page that shows whether you did it." },
  { icon: Users, title: "Hold a team to a deadline", body: "Make a public commitment to a community, with a beneficiary the community picks." },
  { icon: Target, title: "Beat procrastination", body: "Name an anti-charity as beneficiary, so missing the deadline costs you something you care about." },
] as const;

export default function HomePage() {
  return (
    <div>
      <section className="mx-auto max-w-6xl px-4 pb-14 pt-16 sm:px-6 sm:pt-24">
        <div className="max-w-3xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-brand-500/40 bg-brand-500/10 px-3 py-1 text-xs font-medium text-brand-300">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            Judged by GenLayer validator consensus
          </p>
          <h1 className="mt-6 text-4xl font-bold tracking-tight text-white sm:text-6xl">
            Put your money where <span className="text-brand-300">your promise</span> is.
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-zinc-300">
            Write a promise in plain language, lock GEN behind it, and point to public evidence. When the deadline passes, a committee of AI validators
            reads the evidence and has to agree on whether you kept your word. No company, referee, or single AI model decides.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/create" className={buttonClass("primary", "lg")}>
              Make a pledge
              <ArrowRight className="h-5 w-5" aria-hidden />
            </Link>
            <Link href="/pledges" className={buttonClass("secondary", "lg")}>
              Browse pledges
            </Link>
          </div>
          <p className="mt-4 text-xs text-zinc-500">Running on {NETWORK_LABEL[NETWORK_KEY]} with test GEN. Do not stake money you cannot afford to lose.</p>
        </div>

        <div className="mt-10 max-w-3xl">
          <ConfigNotice />
        </div>
      </section>

      <LiveStats />

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6" aria-labelledby="how">
        <h2 id="how" className="text-2xl font-bold text-white sm:text-3xl">
          How a pledge works
        </h2>
        <p className="mt-3 max-w-2xl text-zinc-400">Four steps from promise to verdict. Everything after you sign is automatic.</p>
        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <li key={step.title}>
              <Card className="h-full p-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300">
                    <step.icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Step {index + 1}</span>
                </div>
                <h3 className="mt-4 font-semibold text-white">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{step.body}</p>
              </Card>
            </li>
          ))}
        </ol>
        <div className="mt-6">
          <Link href="/how-it-works" className="inline-flex items-center gap-1.5 text-sm text-brand-300 hover:text-brand-400">
            Read the full walkthrough
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>

      <section className="border-y border-ink-700 bg-ink-900/40" aria-labelledby="why">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2">
          <div>
            <h2 id="why" className="text-2xl font-bold text-white sm:text-3xl">
              Why this needs GenLayer
            </h2>
            <p className="mt-4 leading-relaxed text-zinc-400">
              Whether you &quot;shipped v1&quot; or &quot;ran 100 km this month&quot; is not something a normal smart contract can check. It takes reading a web page and
              judging it. A normal blockchain needs every node to compute the exact same answer, so it cannot do that.
            </p>
            <p className="mt-4 leading-relaxed text-zinc-400">
              GenLayer validators can. One proposes a verdict, the others independently re-read the same evidence and must reach the same verdict, or a new
              proposer is chosen. If they still cannot agree, nothing changes and your stake stays safe.
            </p>
          </div>
          <div className="space-y-4">
            <Card className="flex gap-4 p-5">
              <Scale className="mt-0.5 h-6 w-6 shrink-0 text-brand-300" aria-hidden />
              <div>
                <h3 className="font-semibold text-white">Neutral by design</h3>
                <p className="mt-1 text-sm text-zinc-400">The verdict is agreed by many validators, not decided by us or by one AI provider.</p>
              </div>
            </Card>
            <Card className="flex gap-4 p-5">
              <Link2 className="mt-0.5 h-6 w-6 shrink-0 text-brand-300" aria-hidden />
              <div>
                <h3 className="font-semibold text-white">Evidence anyone can check</h3>
                <p className="mt-1 text-sm text-zinc-400">Every pledge links to its public evidence page and its criteria, so anyone can see what was judged and why.</p>
              </div>
            </Card>
            <Card className="flex gap-4 p-5">
              <Coins className="mt-0.5 h-6 w-6 shrink-0 text-brand-300" aria-hidden />
              <div>
                <h3 className="font-semibold text-white">Safe when things are unclear</h3>
                <p className="mt-1 text-sm text-zinc-400">Missing or ambiguous evidence gives an inconclusive result, not a guess. Unresolved stakes can be returned to the owner.</p>
              </div>
            </Card>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6" aria-labelledby="uses">
        <h2 id="uses" className="text-2xl font-bold text-white sm:text-3xl">
          What people pledge
        </h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {USE_CASES.map((item) => (
            <Card key={item.title} className="flex gap-4 p-5">
              <item.icon className="mt-0.5 h-6 w-6 shrink-0 text-brand-300" aria-hidden />
              <div>
                <h3 className="font-semibold text-white">{item.title}</h3>
                <p className="mt-1 text-sm text-zinc-400">{item.body}</p>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 pb-20 sm:px-6" aria-labelledby="faq">
        <h2 id="faq" className="mb-6 text-2xl font-bold text-white sm:text-3xl">
          Questions
        </h2>
        <Faq />
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        <div className="rounded-3xl border border-brand-500/30 bg-brand-500/10 px-6 py-12 text-center sm:px-12">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">Ready to commit?</h2>
          <p className="mx-auto mt-3 max-w-xl text-zinc-300">Your first pledge takes a minute. Choose an evidence source you do not control, and pick a deadline you can meet.</p>
          <Link href="/create" className={buttonClass("primary", "lg", "mt-6")}>
            Make a pledge
            <ArrowRight className="h-5 w-5" aria-hidden />
          </Link>
        </div>
      </section>
    </div>
  );
}
