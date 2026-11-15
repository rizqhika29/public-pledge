import type { Metadata } from "next";
import { PledgeDetail } from "@/components/PledgeDetail";

export const metadata: Metadata = {
  title: "Pledge",
};

export default async function PledgePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PledgeDetail rawId={id} />;
}
