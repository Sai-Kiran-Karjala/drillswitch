import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Hourglass } from "lucide-react";
import { DrillConsole } from "@/components/drill/drill-console";
import { StartDrillButton } from "@/components/start-drill-button";
import { Skeleton } from "@/components/ui/skeleton";
import { getSession, toPublic } from "@/lib/drill/sessions";

export const metadata: Metadata = { title: "Incident drill — DrillSwitch" };

function ConsoleSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your drill" className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Skeleton className="h-16 w-2/3" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Skeleton className="h-72" />
        <Skeleton className="h-96" />
      </div>
    </div>
  );
}

async function DrillContent({ params }: { params: PageProps<"/drill/[id]">["params"] }) {
  await connection();
  const { id } = await params;
  const session = await getSession(id);

  if (!session) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
        <Hourglass className="size-8 text-muted-foreground" aria-hidden />
        <h1 className="text-xl font-semibold">This drill has ended</h1>
        <p className="text-sm text-muted-foreground">
          Drills expire after 15 minutes and their sandbox flags are cleaned up. Start a fresh one.
        </p>
        <StartDrillButton label="Start a new drill" />
      </div>
    );
  }

  return <DrillConsole session={toPublic(session)} />;
}

export default function DrillPage({ params }: PageProps<"/drill/[id]">) {
  return (
    <Suspense fallback={<ConsoleSkeleton />}>
      <DrillContent params={params} />
    </Suspense>
  );
}
