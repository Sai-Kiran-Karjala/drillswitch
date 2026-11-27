import { CheckCircle2, CircleSlash, MinusCircle, XCircle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { customerStatus, type CustomerStatus, type Scenario } from "@/lib/drill/scenario";

const STATUS: Record<CustomerStatus, { label: string; icon: typeof CheckCircle2; className: string }> = {
  recovered: { label: "Recovered", icon: CheckCircle2, className: "text-success" },
  still_failing: { label: "Still affected", icon: XCircle, className: "text-destructive" },
  unaffected: { label: "Unchanged", icon: MinusCircle, className: "text-muted-foreground" },
  changed: { label: "Collateral", icon: CircleSlash, className: "text-destructive" },
};

function FlagState({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex min-w-10 justify-center rounded px-1.5 py-0.5 font-mono text-xs font-medium",
        on ? "bg-foreground/10 text-foreground" : "bg-muted text-muted-foreground line-through decoration-1",
      )}
    >
      {on ? "ON" : "OFF"}
    </span>
  );
}

export function CustomerTable({
  scenario,
  before,
  after,
  caption,
  afterLabel = "After",
}: {
  scenario: Scenario;
  before: Record<string, boolean>;
  after: Record<string, boolean>;
  caption: string;
  afterLabel?: string;
}) {
  return (
    <Table>
      <caption className="sr-only">{caption}</caption>
      <TableHeader>
        <TableRow>
          <TableHead>Customer</TableHead>
          <TableHead className="hidden sm:table-cell">Details</TableHead>
          <TableHead>Now</TableHead>
          <TableHead>{afterLabel}</TableHead>
          <TableHead>Result</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {scenario.customers.map((c) => {
          const status = STATUS[customerStatus(scenario, c, before[c.id], after[c.id])];
          return (
            <TableRow key={c.id}>
              <TableCell>
                <div className="flex items-center gap-2 font-medium">
                  {c.name}
                  {c.affected && (
                    <span className="rounded bg-incident/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-incident">
                      affected
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground sm:hidden">{c.detail}</div>
              </TableCell>
              <TableCell className="hidden text-muted-foreground sm:table-cell">{c.detail}</TableCell>
              <TableCell>
                <FlagState on={before[c.id]} />
              </TableCell>
              <TableCell>
                <FlagState on={after[c.id]} />
              </TableCell>
              <TableCell>
                <span className={cn("inline-flex items-center gap-1.5 text-sm", status.className)}>
                  <status.icon className="size-4" aria-hidden />
                  {status.label}
                </span>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
