"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export type DrillMode = "demo" | "workspace";

export function StartDrillButton({
  label = "Start the 90-second drill",
  mode = "demo",
  scenario,
  variant = "default",
  size = "lg",
}: {
  label?: string;
  mode?: DrillMode;
  /** A drill id; omit for a random built-in drill. */
  scenario?: string;
  variant?: "default" | "outline" | "secondary";
  size?: "lg" | "sm";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function start() {
    setPending(true);
    try {
      const res = await fetch("/api/drill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, scenario }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start the drill.");
      router.push(`/drill/${data.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start the drill.");
      setPending(false);
    }
  }

  return (
    <Button
      size={size}
      variant={variant}
      onClick={start}
      disabled={pending}
      className={size === "lg" ? "h-11 gap-2 px-5 text-base" : "gap-1.5"}
    >
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Play className="size-4" aria-hidden />}
      {pending ? "Paging you in…" : label}
    </Button>
  );
}
