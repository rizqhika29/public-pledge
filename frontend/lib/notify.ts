import { toast } from "sonner";
import { describeError } from "@/lib/errors";

/** Show any thrown value as a toast with a friendly title and message. */
export function notifyError(error: unknown): void {
  const described = describeError(error);
  if (described.kind === "rejected") {
    toast.info(described.title, { description: described.message });
    return;
  }
  toast.error(described.title, { description: described.message });
}
