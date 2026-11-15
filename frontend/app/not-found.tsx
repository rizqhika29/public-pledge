import Link from "next/link";
import { buttonClass } from "@/lib/styles";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-28 text-center sm:px-6">
      <p className="font-mono text-sm text-brand-300">404</p>
      <h1 className="mt-3 text-3xl font-bold text-white">Page not found</h1>
      <p className="mt-3 text-zinc-400">That page does not exist, or the pledge you are looking for was never created.</p>
      <div className="mt-8 flex gap-3">
        <Link href="/" className={buttonClass("primary", "md")}>
          Go home
        </Link>
        <Link href="/pledges" className={buttonClass("secondary", "md")}>
          Browse pledges
        </Link>
      </div>
    </div>
  );
}
