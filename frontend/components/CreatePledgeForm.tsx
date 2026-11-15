"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, Info } from "lucide-react";
import { ConfigNotice, PageHeader } from "@/components/feedback";
import { useTx } from "@/components/TxProvider";
import { Button, Card, Field, Input, Textarea } from "@/components/ui";
import { fetchAllPledges } from "@/lib/contract";
import { FAUCET, HAS_CONTRACT, NETWORK_KEY } from "@/lib/config";
import { LIMITS, MAX_DEADLINE_LEAD_SECONDS, MIN_DEADLINE_LEAD_SECONDS } from "@/lib/constants";
import { formatDateTime, formatGen, parseGen, toLocalInputValue } from "@/lib/format";
import { useWallet } from "@/lib/genlayer/WalletProvider";
import { notifyError } from "@/lib/notify";
import { isHttpsUrl } from "@/lib/pledge";
import { isAddress, isZeroAddress, sameAddress } from "@/lib/utils";

interface Values {
  promise: string;
  criteria: string;
  url: string;
  beneficiary: string;
  stake: string;
  deadline: string;
}

type Errors = Partial<Record<keyof Values, string>>;

const EMPTY: Values = { promise: "", criteria: "", url: "", beneficiary: "", stake: "", deadline: "" };

function deadlineSeconds(value: string): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

function validate(values: Values, me: string | null, nowSec: number): Errors {
  const errors: Errors = {};

  const promise = values.promise.trim();
  if (!promise) errors.promise = "Describe what you promise to do.";
  else if (promise.length > LIMITS.promiseMax) errors.promise = `Keep it under ${LIMITS.promiseMax} characters.`;

  const criteria = values.criteria.trim();
  if (!criteria) errors.criteria = "Say how a stranger could check it from the evidence page.";
  else if (criteria.length > LIMITS.criteriaMax) errors.criteria = `Keep it under ${LIMITS.criteriaMax} characters.`;

  const url = values.url.trim();
  if (!url) errors.url = "Add the public page validators will read.";
  else if (!isHttpsUrl(url)) errors.url = "Use a full https:// link.";
  else if (url.length > LIMITS.urlMax) errors.url = `Keep the link under ${LIMITS.urlMax} characters.`;

  const beneficiary = values.beneficiary.trim();
  if (!beneficiary) errors.beneficiary = "Choose who receives the stake if you fail.";
  else if (!isAddress(beneficiary)) errors.beneficiary = "Enter a valid wallet address (0x followed by 40 characters).";
  else if (isZeroAddress(beneficiary)) errors.beneficiary = "The zero address cannot be the beneficiary.";
  else if (sameAddress(beneficiary, me)) errors.beneficiary = "The beneficiary must be someone other than you.";

  const stake = parseGen(values.stake);
  if (!values.stake.trim()) errors.stake = "Enter how much GEN to lock.";
  else if (stake === null) errors.stake = "Enter a number such as 1 or 0.5 (up to 18 decimals).";
  else if (stake <= 0n) errors.stake = "The stake must be greater than zero.";

  const deadline = deadlineSeconds(values.deadline);
  if (deadline === null) errors.deadline = "Pick when the promise is due.";
  else if (deadline < nowSec + MIN_DEADLINE_LEAD_SECONDS) errors.deadline = "Pick a time at least 15 minutes from now.";
  else if (deadline > nowSec + MAX_DEADLINE_LEAD_SECONDS) errors.deadline = "The deadline can be at most about a year away.";

  return errors;
}

export function CreatePledgeForm() {
  const wallet = useWallet();
  const tx = useTx();

  const [values, setValues] = useState<Values>(EMPTY);
  const [touched, setTouched] = useState<Partial<Record<keyof Values, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [minLocal, setMinLocal] = useState("");

  // Anything that depends on the current time is set after mount to avoid hydration mismatches.
  useEffect(() => {
    const soon = new Date(Date.now() + (MIN_DEADLINE_LEAD_SECONDS + 60) * 1000);
    setMinLocal(toLocalInputValue(soon));
    setValues((v) => (v.deadline ? v : { ...v, deadline: toLocalInputValue(new Date(Date.now() + 7 * 86400 * 1000)) }));
    setMounted(true);
  }, []);

  const nowSec = Math.floor(Date.now() / 1000);
  const errors = useMemo(() => validate(values, wallet.address, nowSec), [values, wallet.address, nowSec]);
  const hasErrors = Object.keys(errors).length > 0;

  const show = (key: keyof Values) => (touched[key] || submitted ? (errors[key] ?? null) : null);

  const set =
    (key: keyof Values) =>
    (event: { target: { value: string } }) =>
      setValues((v) => ({ ...v, [key]: event.target.value }));
  const blur = (key: keyof Values) => () => setTouched((t) => ({ ...t, [key]: true }));

  const stakeWei = parseGen(values.stake);
  const deadlineSec = deadlineSeconds(values.deadline);
  const faucet = FAUCET[NETWORK_KEY];
  const busy = tx.active || wallet.isBusy;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);

    if (!HAS_CONTRACT) return;
    if (!wallet.address) {
      wallet.openModal();
      return;
    }
    if (!wallet.isCorrectNetwork) {
      try {
        await wallet.switchNetwork();
      } catch (error) {
        notifyError(error);
      }
      return;
    }
    if (hasErrors || stakeWei === null || deadlineSec === null) return;

    const me = wallet.address;
    const promise = values.promise.trim();

    const ok = await tx.run({
      title: "Create pledge",
      functionName: "create_pledge",
      args: [promise, values.url.trim(), values.criteria.trim(), values.beneficiary.trim(), BigInt(deadlineSec)],
      value: stakeWei,
      consensusHint: "Validators check the pledge and lock your stake. No AI is used until someone asks for judgement after the deadline.",
      successTitle: "Pledge created",
      afterSuccess: async () => {
        const all = await fetchAllPledges();
        const mine = all.find((p) => sameAddress(p.owner, me) && p.promise === promise);
        return {
          tone: "good",
          headline: `${formatGen(stakeWei)} GEN locked`,
          detail: "Your pledge is live. When the deadline passes, anyone can ask the validators to judge it.",
          ...(mine ? { href: `/pledges/${mine.id}`, hrefLabel: "View pledge" } : { href: "/pledges", hrefLabel: "Browse pledges" }),
        };
      },
    });

    if (ok) {
      setValues({ ...EMPTY, deadline: toLocalInputValue(new Date(Date.now() + 7 * 86400 * 1000)) });
      setTouched({});
      setSubmitted(false);
    }
  }

  const submitLabel = !wallet.address
    ? "Connect wallet to continue"
    : !wallet.isCorrectNetwork
      ? "Switch network to continue"
      : "Lock stake and create pledge";

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <PageHeader title="New pledge" subtitle="Write the promise, name the proof, and lock a stake. You sign one transaction." />

      <div className="mb-6">
        <ConfigNotice />
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <form onSubmit={onSubmit} noValidate className="space-y-6 lg:col-span-2">
          <Card className="space-y-5 p-6">
            <Field
              label="Your promise"
              htmlFor="promise"
              counter={`${values.promise.trim().length}/${LIMITS.promiseMax}`}
              error={show("promise")}
              hint="One clear, checkable commitment."
            >
              <Textarea
                id="promise"
                value={values.promise}
                onChange={set("promise")}
                onBlur={blur("promise")}
                invalid={!!show("promise")}
                maxLength={LIMITS.promiseMax + 100}
                placeholder="Publish release v1.0 of my project"
              />
            </Field>

            <Field
              label="How it should be judged"
              htmlFor="criteria"
              counter={`${values.criteria.trim().length}/${LIMITS.criteriaMax}`}
              error={show("criteria")}
              hint="Criteria a stranger could verify from the evidence page alone. Include the date or number that decides it."
            >
              <Textarea
                id="criteria"
                value={values.criteria}
                onChange={set("criteria")}
                onBlur={blur("criteria")}
                invalid={!!show("criteria")}
                maxLength={LIMITS.criteriaMax + 100}
                placeholder="A release tagged v1.0 exists on the page and was published before the deadline."
              />
            </Field>

            <Field
              label="Evidence page"
              htmlFor="url"
              error={show("url")}
              hint="A public https page that will still show the proof after the deadline. Prefer a source you do not control."
            >
              <Input
                id="url"
                type="url"
                inputMode="url"
                value={values.url}
                onChange={set("url")}
                onBlur={blur("url")}
                invalid={!!show("url")}
                placeholder="https://github.com/you/project/releases"
              />
            </Field>
          </Card>

          <Card className="space-y-5 p-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Stake (GEN)" htmlFor="stake" error={show("stake")} hint={`Test GEN only. Get some from the ${faucet.label}.`}>
                <Input
                  id="stake"
                  inputMode="decimal"
                  value={values.stake}
                  onChange={set("stake")}
                  onBlur={blur("stake")}
                  invalid={!!show("stake")}
                  placeholder="1.0"
                  autoComplete="off"
                />
              </Field>

              <Field label="Deadline" htmlFor="deadline" error={show("deadline")} hint="Judgement opens after this time (your local time).">
                <Input
                  id="deadline"
                  type="datetime-local"
                  value={values.deadline}
                  onChange={set("deadline")}
                  onBlur={blur("deadline")}
                  invalid={!!show("deadline")}
                  min={mounted ? minLocal : undefined}
                />
              </Field>
            </div>

            <Field
              label="Beneficiary if you fail"
              htmlFor="beneficiary"
              error={show("beneficiary")}
              hint="Wallet that can claim the stake if validators judge the promise broken. A charity, a friend, or an anti-charity you would hate to fund."
            >
              <Input
                id="beneficiary"
                value={values.beneficiary}
                onChange={set("beneficiary")}
                onBlur={blur("beneficiary")}
                invalid={!!show("beneficiary")}
                placeholder="0x…"
                spellCheck={false}
                autoComplete="off"
                className="font-mono"
              />
            </Field>
          </Card>

          <div className="flex flex-wrap items-center gap-4">
            <Button type="submit" size="lg" disabled={busy || !HAS_CONTRACT} loading={wallet.status === "connecting"}>
              {submitLabel}
              <ArrowRight className="h-5 w-5" aria-hidden />
            </Button>
            {submitted && hasErrors && wallet.address && <p className="text-sm text-rose-300">Fix the highlighted fields to continue.</p>}
          </div>
        </form>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card className="p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Summary</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-400">Locked now</dt>
                <dd className="font-semibold text-white">{stakeWei && stakeWei > 0n ? `${formatGen(stakeWei)} GEN` : "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-400">Due</dt>
                <dd className="text-right text-white">{deadlineSec ? formatDateTime(deadlineSec) : "—"}</dd>
              </div>
            </dl>
            <ul className="mt-5 space-y-2 border-t border-ink-700 pt-4 text-sm text-zinc-300">
              <li>
                <span className="text-emerald-300">Kept:</span> you can withdraw the stake.
              </li>
              <li>
                <span className="text-rose-300">Broken:</span> the beneficiary can claim it.
              </li>
              <li>
                <span className="text-amber-300">Unclear:</span> it stays open, and after 7 days you can take it back.
              </li>
            </ul>
          </Card>

          <Card className="flex gap-3 p-5 text-sm text-zinc-400">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-brand-300" aria-hidden />
            <p>
              Your stake is locked until a verdict or a refund. You will need a little extra GEN for network fees.{" "}
              <Link href="/how-it-works" className="text-brand-300 underline underline-offset-2">
                How judgement works
              </Link>
              .
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
