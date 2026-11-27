"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function StartCopilotButton({
  scenario,
  label = "Page the copilot",
  variant = "default",
}: {
  scenario?: string;
  label?: string;
  variant?: "default" | "outline";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function start() {
    setPending(true);
    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenario }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start the incident.");
      router.push(`/copilot/${data.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start the incident.");
      setPending(false);
    }
  }

  return (
    <Button size="sm" variant={variant} onClick={start} disabled={pending} className="gap-1.5">
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Bot className="size-4" aria-hidden />}
      {pending ? "Setting up the incident…" : label}
    </Button>
  );
}
