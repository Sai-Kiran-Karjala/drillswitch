"use client";

import { Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { DRILL_SECONDS } from "@/lib/drill/scenario";

export function Countdown({ secondsLeft, compact = false }: { secondsLeft: number; compact?: boolean }) {
  const clamped = Math.max(0, secondsLeft);
  const pct = (clamped / DRILL_SECONDS) * 100;
  const urgent = clamped <= 20;
  const mm = Math.floor(clamped / 60);
  const ss = String(clamped % 60).padStart(2, "0");

  const bar = (
    <div className="h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
      <div
        className={cn("h-full rounded-full transition-[width] duration-1000 ease-linear", urgent ? "bg-destructive" : "bg-incident")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );

  if (compact) {
    // Mirror of the main timer for small screens; hidden from assistive tech to avoid double announcements.
    return (
      <div className="flex items-center gap-3" aria-hidden>
        <span className={cn("font-mono text-lg font-semibold tabular-nums", urgent ? "text-destructive" : "text-foreground")}>
          {mm}:{ss}
        </span>
        {bar}
      </div>
    );
  }

  return (
    <div className="flex min-w-36 flex-col gap-1.5">
      <div
        role="timer"
        aria-label={`${clamped} seconds left`}
        className={cn(
          "flex items-center justify-end gap-1.5 font-mono text-2xl font-semibold tabular-nums",
          urgent ? "text-destructive" : "text-foreground",
        )}
      >
        <Timer className="size-5" aria-hidden />
        {mm}:{ss}
      </div>
      {bar}
    </div>
  );
}
