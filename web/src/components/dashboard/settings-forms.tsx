"use client";

import { useActionState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  changePlan,
  connectFlagsmith,
  disconnectFlagsmith,
  type ActionState,
} from "@/app/dashboard/settings/actions";

function useToast(state: ActionState) {
  useEffect(() => {
    if (!state) return;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);
}

function Pending({ pending }: { pending: boolean }) {
  return pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null;
}

export function PlanButton({ plan, label, variant }: { plan: "free" | "team"; label: string; variant?: "default" | "outline" }) {
  const [state, action, pending] = useActionState(changePlan, null);
  useToast(state);
  return (
    <form action={action}>
      <input type="hidden" name="plan" value={plan} />
      <Button type="submit" variant={variant} disabled={pending} className="w-full gap-2">
        <Pending pending={pending} />
        {label}
      </Button>
    </form>
  );
}

export function ConnectFlagsmithForm() {
  const [state, action, pending] = useActionState(connectFlagsmith, null);
  useToast(state);
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="fs-url">Flagsmith API URL</Label>
        <Input id="fs-url" name="url" type="url" required defaultValue="https://api.flagsmith.com" autoComplete="off" />
        <p className="text-xs text-muted-foreground">Flagsmith Cloud, or your self-hosted API (https only).</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="fs-key">Organisation API key</Label>
        <Input
          id="fs-key"
          name="apiKey"
          type="password"
          required
          autoComplete="off"
          spellCheck={false}
          placeholder="ser.…"
          aria-describedby="fs-key-help"
        />
        <p id="fs-key-help" className="text-xs text-muted-foreground">
          Organisation settings → API Keys in Flagsmith. Stored encrypted (AES-256-GCM) and never shown again. We
          create one project, <code className="font-mono">DrillSwitch drills</code>, and only touch that.
        </p>
      </div>
      <Button type="submit" disabled={pending} className="w-fit gap-2">
        <Pending pending={pending} />
        {pending ? "Connecting and preparing a project…" : "Connect Flagsmith"}
      </Button>
      {state && !state.ok && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
    </form>
  );
}

export function DisconnectFlagsmithButton() {
  const [state, action, pending] = useActionState(disconnectFlagsmith, null);
  useToast(state);
  return (
    <form action={action}>
      <Button type="submit" variant="outline" disabled={pending} className="gap-2">
        <Pending pending={pending} />
        Disconnect and delete stored key
      </Button>
    </form>
  );
}
