import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { CheckCheck, RotateCcw } from "lucide-react";
import { ToneBadge } from "@/components/app/badges";
import { ConfirmAction } from "@/components/app/confirm-action";
import { PageHeader, Section } from "@/components/app/page-header";
import { Cell2, SimpleTable } from "@/components/app/simple-table";
import { PageSkeleton } from "@/components/app/skeletons";
import { Button } from "@/components/ui/button";
import { AttentionList } from "@/features/dashboard/attention-list";
import { markAllReadAction, resolveNotificationAction } from "@/features/notifications/actions";
import { MarkSentDialog, NewReminderDialog, TaskReminderActions } from "@/features/notifications/reminder-widgets";
import { describeDue, formatDate, formatDateTime } from "@/lib/dates";
import { DELIVERY_CHANNEL, SEVERITY } from "@/lib/labels";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth/current-user";
import { getAttentionItems } from "@/server/services/alerts";
import { engineerOptions } from "@/server/services/engineers";
import { listNotifications, taskReminderSuggestions } from "@/server/services/notifications";
import { projectOptions } from "@/server/services/projects";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return (
    <Suspense fallback={<PageSkeleton tiles={0} rows={10} />}>
      <Notifications />
    </Suspense>
  );
}

async function Notifications() {
  const user = await requireUser();
  const manage = can(user, "engineers.manage");
  const [attention, reminders, suggestions, engineers, projects] = await Promise.all([
    getAttentionItems(user),
    listNotifications(user),
    taskReminderSuggestions(user),
    manage ? engineerOptions() : Promise.resolve([]),
    manage ? projectOptions(user) : Promise.resolve([]),
  ]);
  const open = reminders.filter((r) => !r.resolvedAt);
  const done = reminders.filter((r) => r.resolvedAt).slice(0, 30);
  const unread = reminders.filter((r) => !r.read && !r.resolvedAt).length;

  return (
    <div className="page-enter flex flex-col gap-5">
      <PageHeader
        title="Notifications"
        description="What needs attention now, and reminders to pass on to engineers. Messages are sent by you — through WhatsApp or a call — and marked sent here."
        className="mb-0"
        actions={
          <>
            {manage && (
              <NewReminderDialog engineers={engineers.map((e) => ({ value: e.id, label: e.name }))} projects={projects.map((p) => ({ value: p.id, label: p.name }))} />
            )}
            {unread > 0 && (
              <ConfirmAction
                trigger={
                  <Button variant="ghost" size="lg">
                    <CheckCheck className="size-4" /> Mark all read
                  </Button>
                }
                title="Mark all notifications as read?"
                description="They stay in the list; only the unread count is cleared."
                confirmLabel="Mark read"
                action={markAllReadAction}
              />
            )}
          </>
        }
      />

      <Section title="Needs attention now" description="Worked out from your records every time you open this page.">
        <AttentionList items={attention} limit={25} />
      </Section>

      {suggestions.length > 0 && (
        <Section title="Engineer tasks to remind" description="Open tasks due by tomorrow, or already late.">
          <SimpleTable
            rows={suggestions}
            rowKey={(s) => s.id}
            rowClassName={(s) => (s.late ? "bg-red-50/60" : undefined)}
            columns={[
              { header: "Engineer", cell: (s) => <Cell2 main={<Link href={`/engineers/${s.engineer.id}`} className="hover:underline">{s.engineer.name}</Link>} sub={s.engineer.phone ?? "No phone saved"} /> },
              { header: "Task", cell: (s) => <Cell2 main={s.title} sub={s.project.name} /> },
              { header: "Due", hide: "sm", cell: (s) => <span className={s.late ? "font-medium text-red-700" : undefined}>{describeDue(s.dueDate)}</span> },
              { header: <span className="sr-only">Remind</span>, align: "right", cell: (s) => <TaskReminderActions taskId={s.id} phone={s.engineer.phone} message={s.message} sentToday={s.sentToday} /> },
            ]}
          />
        </Section>
      )}

      <Section title="Reminders" description={open.length ? `${open.length} open` : "No open reminders."}>
        {open.length === 0 && done.length === 0 ? (
          <p className="text-sm text-muted-foreground">Create a reminder to keep track of something you need to tell an engineer or follow up.</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border">
            {[...open, ...done].map((n) => (
              <li key={n.id} className={cn("flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-start sm:justify-between", n.resolvedAt && "text-muted-foreground")}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {!n.read && !n.resolvedAt && <span className="size-2 rounded-full bg-sky-600" aria-label="Unread" />}
                    <span className="font-medium">{n.link ? <Link href={n.link} className="hover:underline">{n.title}</Link> : n.title}</span>
                    {!n.resolvedAt && <ToneBadge tone={SEVERITY[n.severity].tone}>{SEVERITY[n.severity].label}</ToneBadge>}
                    {n.resolvedAt && <ToneBadge tone="grey">Done</ToneBadge>}
                  </div>
                  <p className="text-sm">{n.message}</p>
                  <p className="text-xs text-muted-foreground">
                    {[n.engineer && `For ${n.engineer.name}`, n.project?.name, n.dueDate && `due ${formatDate(n.dueDate)}`, `created ${formatDateTime(n.createdAt)}`].filter(Boolean).join(" · ")}
                  </p>
                  {n.deliveries.length > 0 && (
                    <p className="text-xs text-emerald-700">
                      {n.deliveries
                        .map((d) => `Sent by ${DELIVERY_CHANNEL[d.channel].toLowerCase()} — ${d.sentBy.name}, ${formatDateTime(d.sentAt)}${d.note ? ` (“${d.note}”)` : ""}`)
                        .join(" · ")}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  {!n.resolvedAt ? (
                    <>
                      <MarkSentDialog id={n.id} phone={n.engineer?.phone ?? null} message={n.message} />
                      <ConfirmAction
                        trigger={
                          <Button size="sm" variant="ghost">
                            Done
                          </Button>
                        }
                        title="Mark this reminder as done?"
                        description="Use this when it no longer needs to be passed on."
                        confirmLabel="Done"
                        action={resolveNotificationAction.bind(null, n.id, true)}
                      />
                    </>
                  ) : (
                    <ConfirmAction
                      trigger={
                        <Button size="sm" variant="ghost" aria-label="Re-open">
                          <RotateCcw className="size-4" />
                        </Button>
                      }
                      title="Re-open this reminder?"
                      description="It goes back to the open list."
                      confirmLabel="Re-open"
                      action={resolveNotificationAction.bind(null, n.id, false)}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
