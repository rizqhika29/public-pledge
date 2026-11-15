import type { Metadata } from "next";
import { PledgesBrowser } from "@/components/PledgesBrowser";

export const metadata: Metadata = {
  title: "Pledges",
  description: "Every pledge on the contract, with its stake, deadline, and validator verdict.",
};

export default function PledgesPage() {
  return <PledgesBrowser />;
}
