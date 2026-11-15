import type { Metadata } from "next";
import { CreatePledgeForm } from "@/components/CreatePledgeForm";

export const metadata: Metadata = {
  title: "New pledge",
  description: "Write a promise, lock a stake, and name the evidence validators will check.",
};

export default function CreatePage() {
  return <CreatePledgeForm />;
}
