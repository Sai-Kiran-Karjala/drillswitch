import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Hourglass } from "lucide-react";
import { CopilotConsole } from "@/components/copilot/copilot-console";
import { StartCopilotButton } from "@/components/copilot/start-copilot-button";
import { Skeleton } from "@/components/ui/skeleton";
import { getSession, toPublic } from "@/lib/drill/sessions";

export const metadata: Metadata = { title: "Copilot incident — DrillSwitch" };

async function Content({ params }: { params: PageProps<"/copilot/[id]">["params"] }) {
  await connection();
  const { id } = await params;
  const session = getSession(id);
  if (!session || session.source !== "agent") {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
        <Hourglass className="size-8 text-muted-foreground" aria-hidden />
        <h1 className="text-xl font-semibold">This incident has ended</h1>
        <p className="text-sm text-muted-foreground">Copilot incidents expire after 15 minutes. Start a fresh one.</p>
        <StartCopilotButton label="New copilot incident" />
      </div>
    );
  }
  return <CopilotConsole session={toPublic(session)} initialRun={session.agentRun ?? null} />;
}

export default function CopilotIncidentPage({ params }: PageProps<"/copilot/[id]">) {
  return (
    <Suspense
      fallback={
        <div aria-busy="true" aria-label="Loading the incident" className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
          <Skeleton className="h-96" />
        </div>
      }
    >
      <Content params={params} />
    </Suspense>
  );
}
