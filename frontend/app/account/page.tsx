import type { Metadata } from "next";
import { AccountView } from "@/components/AccountView";

export const metadata: Metadata = {
  title: "My account",
  description: "Your pledges, your record, and the balance you can withdraw.",
};

export default function AccountPage() {
  return <AccountView />;
}
