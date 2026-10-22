import Link from "next/link";
import { CheckCircle2, MessageCircle } from "lucide-react";
import { WorkStatusBadge } from "@/components/app/badges";
import { ConfirmAction } from "@/components/app/confirm-action";
import { Cell2, SimpleTable } from "@/components/app/simple-table";
import { Button } from "@/components/ui/button";
import { whatsappLink } from "@/lib/contact";
import { describeDue, formatDate } from "@/lib/dates";
import type { EngineerTaskRow } from "@/server/services/engineers";
import { updateEngineerTaskAction } from "./actions";

const KIND: Record<string, string> = { TASK: "Task", INSPECTION: "Inspection", SITE_VISIT: "Site visit", REPORT: "Report" };

export function EngineerTasksList({ tasks, canManage, show = "project" }: { tasks: EngineerTaskRow[]; canManage: boolean; show?: "project" | "engineer" }) {
  if (tasks.length === 0) return <p className="text-sm text-muted-foreground">No tasks yet.</p>;
  return (
    <SimpleTable
      rows={tasks}
      rowKey={(t) => t.id}
      rowClassName={(t) => (t.overdue ? "bg-red-50/60" : undefined)}
      columns={[
        { header: "Task", cell: (t) => <Cell2 main={t.title} sub={[KIND[t.kind], t.workItem?.name, t.notes].filter(Boolean).join(" · ")} /> },
        show === "project"
          ? { header: "Project", hide: "md", cell: (t) => <Link href={`/projects/${t.project.id}`} className="hover:underline">{t.project.name}</Link> }
          : { header: "Engineer", hide: "md", cell: (t) => <Link href={`/engineers/${t.engineer.id}`} className="hover:underline">{t.engineer.name}</Link> },
        {
          header: "Due",
          cell: (t) =>
            t.status === "COMPLETED" ? (
              <Cell2 main="Done" sub={formatDate(t.completedOn)} />
            ) : t.dueDate ? (
              <Cell2 main={formatDate(t.dueDate)} sub={<span className={t.overdue ? "font-semibold text-red-700" : undefined}>{describeDue(t.dueDate)}</span>} />
            ) : (
              "—"
            ),
        },
        { header: "Status", hide: "sm", cell: (t) => <WorkStatusBadge status={t.status} /> },
        {
          header: "",
          align: "right",
          cell: (t) => {
            const wa =
              t.status !== "COMPLETED"
                ? whatsappLink(t.engineer.phone, `Reminder: ${t.title} at ${t.project.name}${t.dueDate ? ` — due ${formatDate(t.dueDate)}` : ""}. Please update once done.`)
                : null;
            return (
              <div className="flex justify-end gap-1">
                {wa && (
                  <Button asChild size="sm" variant="ghost" title="Send reminder on WhatsApp">
                    <a href={wa} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="size-4" />
                    </a>
                  </Button>
                )}
                {canManage && t.status !== "COMPLETED" && (
                  <ConfirmAction
                    trigger={
                      <Button size="sm" variant="outline">
                        <CheckCircle2 className="size-4" /> Done
                      </Button>
                    }
                    title={`Mark "${t.title}" as done?`}
                    description={`${t.engineer.name} · ${t.project.name}`}
                    confirmLabel="Mark done"
                    reason={{ label: "Result / note (optional)", placeholder: "e.g. Cube strength OK — 26 N/mm²" }}
                    action={updateEngineerTaskAction.bind(null, t.id, "COMPLETED")}
                  />
                )}
              </div>
            );
          },
        },
      ]}
    />
  );
}
